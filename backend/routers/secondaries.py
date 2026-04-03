from __future__ import annotations

import csv
import io

from fastapi import APIRouter
from fastapi import Depends
from fastapi import File
from fastapi import HTTPException
from fastapi import UploadFile
from sqlalchemy import func
from sqlalchemy import or_
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from utils import tokenize_search
from models import Fluorophore
from models import SecondaryAntibody
from schemas import PaginatedResponse
from schemas import SecondaryAntibodyCreate
from schemas import SecondaryAntibodyResponse
from schemas import SecondaryAntibodyUpdate
from schemas import SecondaryImportConfirmRequest
from schemas import SecondaryImportConfirmResponse
from schemas import SecondaryImportItem
from schemas import SecondaryImportResponse

router = APIRouter()


def _to_response(sa: SecondaryAntibody) -> dict:
    return {
        "id": sa.id,
        "name": sa.name,
        "host": sa.host,
        "target_species": sa.target_species,
        "target_isotype": sa.target_isotype,
        "binding_mode": sa.binding_mode or "species",
        "target_conjugate": sa.target_conjugate,
        "fluorophore_id": sa.fluorophore_id,
        "fluorophore_name": sa.fluorophore.name if sa.fluorophore else None,
        "vendor": sa.vendor,
        "catalog_number": sa.catalog_number,
        "lot_number": sa.lot_number,
        "notes": sa.notes,
        "created_at": sa.created_at,
        "updated_at": sa.updated_at,
    }


@router.get("/", response_model=PaginatedResponse[SecondaryAntibodyResponse])
def list_secondary_antibodies(
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
    host: str | None = None,
    target_species: str | None = None,
    target_isotype: str | None = None,
    db: Session = Depends(get_db),
):
    limit = min(limit, 500)
    stmt = select(SecondaryAntibody)

    if search:
        for token in tokenize_search(search):
            pattern = "%%%s%%" % token
            stmt = stmt.where(
                or_(
                    SecondaryAntibody.name.ilike(pattern),
                    SecondaryAntibody.host.ilike(pattern),
                    SecondaryAntibody.target_species.ilike(pattern),
                    SecondaryAntibody.vendor.ilike(pattern),
                    SecondaryAntibody.catalog_number.ilike(pattern),
                )
            )
    if host:
        stmt = stmt.where(SecondaryAntibody.host == host)
    if target_species:
        stmt = stmt.where(SecondaryAntibody.target_species == target_species)
    if target_isotype:
        stmt = stmt.where(SecondaryAntibody.target_isotype == target_isotype)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    results = list(db.scalars(stmt.offset(skip).limit(limit)))
    items = [_to_response(sa) for sa in results]
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("/", response_model=SecondaryAntibodyResponse, status_code=201)
def create_secondary_antibody(
    data: SecondaryAntibodyCreate,
    db: Session = Depends(get_db),
):
    if data.binding_mode not in ("species", "conjugate"):
        raise HTTPException(status_code=400, detail="binding_mode must be 'species' or 'conjugate'")
    if data.binding_mode == "conjugate":
        if not data.target_conjugate or not data.target_conjugate.strip():
            raise HTTPException(status_code=400, detail="target_conjugate is required when binding_mode is 'conjugate'")
        data.target_conjugate = data.target_conjugate.strip().lower()
    if data.binding_mode == "species" and not data.target_species.strip():
        raise HTTPException(status_code=400, detail="target_species is required when binding_mode is 'species'")

    if data.fluorophore_id is not None:
        fl = db.get(Fluorophore, data.fluorophore_id)
        if fl is None:
            raise HTTPException(status_code=404, detail="Fluorophore not found")

    sa = SecondaryAntibody(**data.model_dump())
    db.add(sa)
    db.commit()
    db.refresh(sa)
    return _to_response(sa)


# --- CSV Import ---

_HEADER_MAP = {
    "name": "name",
    "host": "host",
    "target_species": "target_species",
    "target species": "target_species",
    "target_isotype": "target_isotype",
    "target isotype": "target_isotype",
    "isotype": "target_isotype",
    "fluorophore": "fluorophore",
    "fluorophore_name": "fluorophore",
    "dye": "fluorophore",
    "vendor": "vendor",
    "catalog_number": "catalog_number",
    "catalog": "catalog_number",
    "cat#": "catalog_number",
    "lot_number": "lot_number",
    "lot": "lot_number",
}


@router.post("/import-csv", response_model=SecondaryImportResponse)
async def import_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="CSV file has no headers")

    # Map CSV headers to canonical field names (case-insensitive)
    col_map: dict[str, str] = {}
    for raw_header in reader.fieldnames:
        key = raw_header.strip().lower()
        if key in _HEADER_MAP:
            col_map[raw_header] = _HEADER_MAP[key]

    # Validate required columns present
    mapped_fields = set(col_map.values())
    for required in ("name", "host", "target_species"):
        if required not in mapped_fields:
            raise HTTPException(
                status_code=400,
                detail="Missing required column: %s" % required,
            )

    # Build fluorophore lookup (case-insensitive name → id, name)
    all_fluorophores = list(db.scalars(select(Fluorophore)))
    fl_lookup: dict[str, tuple[str, str]] = {}
    for fl in all_fluorophores:
        fl_lookup[fl.name.lower()] = (fl.id, fl.name)

    items: list[dict] = []
    warning_count = 0

    for row_idx, row in enumerate(reader, start=2):
        mapped: dict[str, str | None] = {}
        for raw_header, canonical in col_map.items():
            val = row.get(raw_header, "")
            mapped[canonical] = val.strip() if val and val.strip() else None

        name = mapped.get("name")
        host = mapped.get("host")
        target_species = mapped.get("target_species")

        if not name or not host or not target_species:
            # Skip rows missing required fields
            continue

        warnings: list[str] = []
        fluorophore_id = None
        fluorophore_name = None
        raw_fl = mapped.get("fluorophore")
        if raw_fl:
            match = fl_lookup.get(raw_fl.lower())
            if match:
                fluorophore_id, fluorophore_name = match
            else:
                warnings.append("Fluorophore '%s' not found in library" % raw_fl)
                fluorophore_name = raw_fl

        if warnings:
            warning_count += len(warnings)

        items.append({
            "name": name,
            "host": host,
            "target_species": target_species,
            "target_isotype": mapped.get("target_isotype"),
            "binding_mode": "conjugate" if name.lower().find("streptavidin") >= 0 else "species",
            "target_conjugate": "biotin" if name.lower().find("streptavidin") >= 0 else None,
            "fluorophore_name": fluorophore_name,
            "fluorophore_id": fluorophore_id,
            "vendor": mapped.get("vendor"),
            "catalog_number": mapped.get("catalog_number"),
            "lot_number": mapped.get("lot_number"),
            "warnings": warnings,
            "row_number": row_idx,
        })

    return {
        "items": items,
        "total_rows": len(items),
        "valid_rows": len([i for i in items if not i["warnings"]]),
        "warning_count": warning_count,
    }


@router.post("/import-confirm", response_model=SecondaryImportConfirmResponse)
def import_confirm(
    body: SecondaryImportConfirmRequest,
    db: Session = Depends(get_db),
):
    created = 0
    skipped = 0
    errors: list[str] = []

    for item in body.items:
        # Check for duplicate: same name + fluorophore_id
        dup_stmt = select(SecondaryAntibody).where(
            SecondaryAntibody.name == item.name,
        )
        if item.fluorophore_id:
            dup_stmt = dup_stmt.where(
                SecondaryAntibody.fluorophore_id == item.fluorophore_id,
            )
        else:
            dup_stmt = dup_stmt.where(
                SecondaryAntibody.fluorophore_id.is_(None),
            )
        existing = db.scalar(dup_stmt)
        if existing:
            skipped += 1
            continue

        try:
            sa = SecondaryAntibody(
                name=item.name,
                host=item.host,
                target_species=item.target_species,
                target_isotype=item.target_isotype,
                binding_mode=item.binding_mode or "species",
                target_conjugate=item.target_conjugate.strip().lower() if item.target_conjugate else None,
                fluorophore_id=item.fluorophore_id,
                vendor=item.vendor,
                catalog_number=item.catalog_number,
                lot_number=item.lot_number,
            )
            db.add(sa)
            db.flush()
            created += 1
        except Exception as exc:
            errors.append("Row %d (%s): %s" % (item.row_number, item.name, str(exc)))
            db.rollback()

    if created > 0:
        db.commit()

    return {"created": created, "skipped": skipped, "errors": errors}


@router.get("/{id}", response_model=SecondaryAntibodyResponse)
def get_secondary_antibody(id: str, db: Session = Depends(get_db)):
    sa = db.get(SecondaryAntibody, id)
    if sa is None:
        raise HTTPException(status_code=404, detail="Secondary antibody not found")
    return _to_response(sa)


@router.put("/{id}", response_model=SecondaryAntibodyResponse)
def update_secondary_antibody(
    id: str,
    data: SecondaryAntibodyUpdate,
    db: Session = Depends(get_db),
):
    sa = db.get(SecondaryAntibody, id)
    if sa is None:
        raise HTTPException(status_code=404, detail="Secondary antibody not found")

    if data.binding_mode not in ("species", "conjugate"):
        raise HTTPException(status_code=400, detail="binding_mode must be 'species' or 'conjugate'")
    if data.binding_mode == "conjugate":
        if not data.target_conjugate or not data.target_conjugate.strip():
            raise HTTPException(status_code=400, detail="target_conjugate is required when binding_mode is 'conjugate'")
        data.target_conjugate = data.target_conjugate.strip().lower()

    if data.fluorophore_id is not None:
        fl = db.get(Fluorophore, data.fluorophore_id)
        if fl is None:
            raise HTTPException(status_code=404, detail="Fluorophore not found")

    for key, value in data.model_dump().items():
        setattr(sa, key, value)
    db.commit()
    db.refresh(sa)
    return _to_response(sa)


@router.delete("/{id}", status_code=204)
def delete_secondary_antibody(id: str, db: Session = Depends(get_db)):
    sa = db.get(SecondaryAntibody, id)
    if sa is None:
        raise HTTPException(status_code=404, detail="Secondary antibody not found")
    db.delete(sa)
    db.commit()
