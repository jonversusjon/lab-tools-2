from __future__ import annotations

import json
import logging

from fastapi import APIRouter
from fastapi import Depends
from fastapi import File
from fastapi import HTTPException
from fastapi import UploadFile
from sqlalchemy import and_
from sqlalchemy import func
from sqlalchemy import or_
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload
from sqlalchemy.orm import selectinload

from database import get_db
from models import Antibody
from models import AntibodyTag
from models import AntibodyTagAssignment
from models import Fluorophore
from schemas import AntibodyCreate
from schemas import AntibodyRead
from schemas import AntibodyUpdate
from schemas import CsvImportResponse
from schemas import ExistingAntibodyRow
from schemas import FavoriteToggle
from schemas import ImportAntibodyItem
from schemas import ImportConfirmRequest
from schemas import ImportConfirmResponse
from schemas import ImportSummary
from schemas import NewAntibodyRow
from schemas import PaginatedResponse
from schemas import ParseErrorRow
from schemas import TagAssignRequest
from schemas import TagRead
from services.csv_import import parse_csv_file

logger = logging.getLogger(__name__)

router = APIRouter()


def _to_read(ab: Antibody) -> dict:
    reacts_with = None
    if ab.reacts_with:
        try:
            reacts_with = json.loads(ab.reacts_with)
        except (json.JSONDecodeError, TypeError):
            reacts_with = []

    return {
        "id": ab.id,
        "name": ab.name,
        "target": ab.target,
        "clone": ab.clone,
        "host": ab.host,
        "isotype": ab.isotype,
        "fluorophore_id": ab.fluorophore_id,
        "conjugate": ab.conjugate,
        "vendor": ab.vendor,
        "catalog_number": ab.catalog_number,
        "confirmed_in_stock": ab.confirmed_in_stock,
        "date_received": ab.date_received,
        "flow_dilution": ab.flow_dilution,
        "icc_if_dilution": ab.icc_if_dilution,
        "wb_dilution": ab.wb_dilution,
        "reacts_with": reacts_with,
        "storage_temp": ab.storage_temp,
        "validation_notes": ab.validation_notes,
        "notes": ab.notes,
        "website": ab.website,
        "physical_location": ab.physical_location,
        "fluorophore_name": ab.fluorophore.name if ab.fluorophore else None,
        "is_favorite": ab.is_favorite,
        "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in (ab.tags or [])],
        "created_at": ab.created_at.isoformat() if ab.created_at else None,
        "updated_at": ab.updated_at.isoformat() if ab.updated_at else None,
    }


@router.get("/", response_model=PaginatedResponse[AntibodyRead])
def list_antibodies(
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
    favorites: bool | None = None,
    tags: str | None = None,
    host: str | None = None,
    vendor: str | None = None,
    conjugate: str | None = None,
    in_stock: bool | None = None,
    storage_temp: str | None = None,
    db: Session = Depends(get_db),
):
    limit = min(limit, 500)
    stmt = (
        select(Antibody)
        .options(joinedload(Antibody.fluorophore), selectinload(Antibody.tags))
    )

    # Apply filters
    if search:
        term = "%%%s%%" % search.lower()
        stmt = stmt.where(
            or_(
                func.lower(Antibody.target).contains(search.lower()),
                func.lower(Antibody.name).contains(search.lower()),
                func.lower(Antibody.catalog_number).contains(search.lower()),
                func.lower(Antibody.vendor).contains(search.lower()),
            )
        )

    if favorites is True:
        stmt = stmt.where(Antibody.is_favorite == True)

    if host:
        stmt = stmt.where(func.lower(Antibody.host) == host.lower())

    if vendor:
        stmt = stmt.where(func.lower(Antibody.vendor) == vendor.lower())

    if conjugate:
        stmt = stmt.where(func.lower(Antibody.conjugate) == conjugate.lower())

    if in_stock is not None:
        stmt = stmt.where(Antibody.confirmed_in_stock == in_stock)

    if storage_temp:
        stmt = stmt.where(Antibody.storage_temp == storage_temp)

    if tags:
        tag_ids = [t.strip() for t in tags.split(",") if t.strip()]
        if tag_ids:
            stmt = stmt.where(
                Antibody.id.in_(
                    select(AntibodyTagAssignment.antibody_id).where(
                        AntibodyTagAssignment.tag_id.in_(tag_ids)
                    )
                )
            )

    # Count before pagination
    count_stmt = select(func.count()).select_from(stmt.subquery())
    total = db.scalar(count_stmt)

    stmt = stmt.offset(skip).limit(limit)
    items = list(db.scalars(stmt).unique())

    return {
        "items": [_to_read(ab) for ab in items],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.post("/", response_model=AntibodyRead, status_code=201)
def create_antibody(
    data: AntibodyCreate,
    db: Session = Depends(get_db),
):
    if data.fluorophore_id is not None:
        fl = db.get(Fluorophore, data.fluorophore_id)
        if fl is None:
            raise HTTPException(status_code=404, detail="Fluorophore not found")

    reacts_with_json = None
    if data.reacts_with is not None:
        reacts_with_json = json.dumps(data.reacts_with)

    antibody = Antibody(
        name=data.name,
        target=data.target,
        clone=data.clone,
        host=data.host,
        isotype=data.isotype,
        fluorophore_id=data.fluorophore_id,
        conjugate=data.conjugate,
        vendor=data.vendor,
        catalog_number=data.catalog_number,
        confirmed_in_stock=data.confirmed_in_stock,
        date_received=data.date_received,
        flow_dilution=data.flow_dilution,
        icc_if_dilution=data.icc_if_dilution,
        wb_dilution=data.wb_dilution,
        reacts_with=reacts_with_json,
        storage_temp=data.storage_temp,
        validation_notes=data.validation_notes,
        notes=data.notes,
        website=data.website,
        physical_location=data.physical_location,
    )
    db.add(antibody)
    db.commit()
    db.refresh(antibody)

    stmt = (
        select(Antibody)
        .options(joinedload(Antibody.fluorophore), selectinload(Antibody.tags))
        .where(Antibody.id == antibody.id)
    )
    antibody = db.scalars(stmt).first()
    return _to_read(antibody)


@router.get("/{id}", response_model=AntibodyRead)
def get_antibody(id: str, db: Session = Depends(get_db)):
    stmt = (
        select(Antibody)
        .options(joinedload(Antibody.fluorophore), selectinload(Antibody.tags))
        .where(Antibody.id == id)
    )
    antibody = db.scalars(stmt).first()
    if antibody is None:
        raise HTTPException(status_code=404, detail="Antibody not found")
    return _to_read(antibody)


@router.put("/{id}", response_model=AntibodyRead)
def update_antibody(
    id: str,
    data: AntibodyUpdate,
    db: Session = Depends(get_db),
):
    antibody = db.get(Antibody, id)
    if antibody is None:
        raise HTTPException(status_code=404, detail="Antibody not found")

    if data.fluorophore_id is not None:
        fl = db.get(Fluorophore, data.fluorophore_id)
        if fl is None:
            raise HTTPException(status_code=404, detail="Fluorophore not found")

    antibody.name = data.name
    antibody.target = data.target
    antibody.clone = data.clone
    antibody.host = data.host
    antibody.isotype = data.isotype
    antibody.fluorophore_id = data.fluorophore_id
    antibody.conjugate = data.conjugate
    antibody.vendor = data.vendor
    antibody.catalog_number = data.catalog_number
    antibody.confirmed_in_stock = data.confirmed_in_stock
    antibody.date_received = data.date_received
    antibody.flow_dilution = data.flow_dilution
    antibody.icc_if_dilution = data.icc_if_dilution
    antibody.wb_dilution = data.wb_dilution
    antibody.reacts_with = json.dumps(data.reacts_with) if data.reacts_with is not None else None
    antibody.storage_temp = data.storage_temp
    antibody.validation_notes = data.validation_notes
    antibody.notes = data.notes
    antibody.website = data.website
    antibody.physical_location = data.physical_location
    db.commit()

    stmt = (
        select(Antibody)
        .options(joinedload(Antibody.fluorophore), selectinload(Antibody.tags))
        .where(Antibody.id == antibody.id)
    )
    antibody = db.scalars(stmt).first()
    return _to_read(antibody)


@router.delete("/{id}", status_code=204)
def delete_antibody(id: str, db: Session = Depends(get_db)):
    antibody = db.get(Antibody, id)
    if antibody is None:
        raise HTTPException(status_code=404, detail="Antibody not found")
    db.delete(antibody)
    db.commit()


# --- Favorites ---

@router.patch("/{id}/favorite", response_model=AntibodyRead)
def toggle_favorite(
    id: str,
    body: FavoriteToggle,
    db: Session = Depends(get_db),
):
    antibody = db.get(Antibody, id)
    if antibody is None:
        raise HTTPException(status_code=404, detail="Antibody not found")
    antibody.is_favorite = body.is_favorite
    db.commit()

    stmt = (
        select(Antibody)
        .options(joinedload(Antibody.fluorophore), selectinload(Antibody.tags))
        .where(Antibody.id == antibody.id)
    )
    antibody = db.scalars(stmt).first()
    return _to_read(antibody)


# --- Tags on antibodies ---

@router.post("/{id}/tags", response_model=AntibodyRead)
def assign_tags(
    id: str,
    body: TagAssignRequest,
    db: Session = Depends(get_db),
):
    antibody = db.get(Antibody, id)
    if antibody is None:
        raise HTTPException(status_code=404, detail="Antibody not found")

    # Verify all tag IDs exist
    existing_tags = list(
        db.scalars(select(AntibodyTag).where(AntibodyTag.id.in_(body.tag_ids)))
    )
    if len(existing_tags) != len(body.tag_ids):
        raise HTTPException(status_code=404, detail="One or more tags not found")

    # Replace all tag assignments
    db.execute(
        AntibodyTagAssignment.__table__.delete().where(
            AntibodyTagAssignment.antibody_id == id
        )
    )
    for tag in existing_tags:
        db.execute(
            AntibodyTagAssignment.__table__.insert().values(
                antibody_id=id, tag_id=tag.id
            )
        )
    db.commit()

    stmt = (
        select(Antibody)
        .options(joinedload(Antibody.fluorophore), selectinload(Antibody.tags))
        .where(Antibody.id == antibody.id)
    )
    antibody = db.scalars(stmt).first()
    return _to_read(antibody)


@router.delete("/{id}/tags/{tag_id}", status_code=204)
def remove_tag(
    id: str,
    tag_id: str,
    db: Session = Depends(get_db),
):
    antibody = db.get(Antibody, id)
    if antibody is None:
        raise HTTPException(status_code=404, detail="Antibody not found")

    result = db.execute(
        AntibodyTagAssignment.__table__.delete().where(
            and_(
                AntibodyTagAssignment.antibody_id == id,
                AntibodyTagAssignment.tag_id == tag_id,
            )
        )
    )
    if result.rowcount == 0:
        raise HTTPException(status_code=404, detail="Tag assignment not found")
    db.commit()


# --- CSV Import ---

@router.post("/import-csv", response_model=CsvImportResponse)
async def import_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    content = await file.read()
    rows = parse_csv_file(content)

    new_antibodies = []
    already_exists = []
    parse_errors = []

    for row_result in rows:
        idx = row_result["csv_row_index"]

        if row_result["error"]:
            parse_errors.append({
                "csv_row_index": idx,
                "raw_row": {},
                "error": row_result["error"],
            })
            continue

        parsed = row_result["parsed"]

        # Check for existing antibody by (name, catalog_number) dedup key
        name = parsed["name"]
        catalog = parsed["catalog_number"]

        existing = None
        if name and catalog:
            existing = db.scalar(
                select(Antibody).where(
                    and_(
                        Antibody.name == name,
                        Antibody.catalog_number == catalog,
                    )
                )
            )
        elif name:
            # If no catalog number, check by name alone (less strict)
            existing = db.scalar(
                select(Antibody).where(
                    and_(
                        Antibody.name == name,
                        Antibody.catalog_number.is_(None),
                    )
                )
            )

        if existing:
            already_exists.append({
                "csv_row_index": idx,
                "name": name,
                "catalog_number": catalog,
                "existing_id": existing.id,
            })
        else:
            new_antibodies.append({
                "csv_row_index": idx,
                "parsed": parsed,
                "missing_fields": row_result["missing_fields"],
                "warnings": row_result["warnings"],
            })

    summary = {
        "total_csv_rows": len(rows),
        "new": len(new_antibodies),
        "existing": len(already_exists),
        "errors": len(parse_errors),
    }

    return {
        "new_antibodies": new_antibodies,
        "already_exists": already_exists,
        "parse_errors": parse_errors,
        "summary": summary,
    }


@router.post("/import-confirm", response_model=ImportConfirmResponse)
def import_confirm(
    body: ImportConfirmRequest,
    db: Session = Depends(get_db),
):
    imported = 0
    errors = []

    for item in body.antibodies:
        try:
            # Use name as target if target not provided
            target = item.target or item.name or "Unknown"

            reacts_with_json = None
            if item.reacts_with:
                reacts_with_json = json.dumps(item.reacts_with)

            antibody = Antibody(
                name=item.name,
                target=target,
                host=item.host,
                isotype=item.isotype,
                conjugate=item.conjugate,
                vendor=item.vendor,
                catalog_number=item.catalog_number,
                confirmed_in_stock=item.confirmed_in_stock,
                date_received=item.date_received,
                flow_dilution=item.flow_dilution,
                icc_if_dilution=item.icc_if_dilution,
                wb_dilution=item.wb_dilution,
                reacts_with=reacts_with_json,
                storage_temp=item.storage_temp,
                validation_notes=item.validation_notes,
                notes=item.notes,
                website=item.website,
                physical_location=item.physical_location,
            )
            db.add(antibody)
            db.flush()
            imported += 1
        except IntegrityError:
            db.rollback()
            errors.append({
                "name": item.name,
                "error": "Duplicate antibody (name + catalog number already exists)",
            })
            continue

    if imported > 0:
        db.commit()

    return {"imported": imported, "errors": errors}


# --- Commented-out Notion Direct Import ---
# TODO: Notion Direct Import — activate when API permissions are available
#
# @router.post("/import-notion")
# async def import_from_notion(database_id: str, notion_api_key: str):
#     """
#     Paginate through Notion database via API.
#     Use notion_page_id for upsert (add column to antibodies table when activating).
#     See column map in services/csv_import.py — Notion types differ slightly from CSV:
#       - "Confirmed we have it" is a checkbox (bool), not "Yes"/"No" string
#       - "Date Received" accessed via .date.start
#       - "Reacts with" is multi_select (array), not comma-separated string
#       - "Cojugate" is a select, not free text
#     """
#     pass
