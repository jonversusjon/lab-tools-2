from __future__ import annotations

import uuid

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy import delete
from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import Detector
from models import Fluorophore
from models import FluorophoreSpectrum
from models import Instrument
from models import Laser
from models import PanelAssignment
from fastapi import File as FastAPIFile
from fastapi import UploadFile
from schemas import BatchFetchFpbaseRequest
from schemas import BatchFetchFpbaseResult
from schemas import BatchSpectraRequest
from schemas import DetectorCompatibility
from schemas import FetchFpbaseRequest
from schemas import FluorophoreCreate
from schemas import FluorophoreImportConfirmRequest
from schemas import FluorophoreImportConfirmResponse
from schemas import FluorophoreImportPreview
from schemas import FluorophoreRead
from schemas import FluorophoreSpectraResponse
from schemas import FpbaseCatalogItem
from schemas import InstrumentCompatibility
from schemas import InstrumentCompatibilityResponse
from schemas import LaserCompatibility
from schemas import PaginatedResponse
from services.fluorophore_import import confirm_import as do_confirm_import
from services.fluorophore_import import parse_csv
from services.fluorophore_import import parse_json
from services.spectra import integrate_bandpass
from services.spectra import interpolate_at
from services.spectra import load_spectra_for

router = APIRouter()
from models import Panel

@router.get("/recent", response_model=list[str])
def get_recent_fluorophores(db: Session = Depends(get_db)):
    # Retrieve up to 10 most recent unique fluorophores assigned in any panel
    stmt = (
        select(PanelAssignment.fluorophore_id)
        .join(Panel, PanelAssignment.panel_id == Panel.id)
        .order_by(Panel.updated_at.desc(), PanelAssignment.id)
        .limit(100)
    )
    all_assigned = db.scalars(stmt).all()
    seen = set()
    unique_ids = []
    for fid in all_assigned:
        if fid not in seen:
            seen.add(fid)
            unique_ids.append(fid)
            if len(unique_ids) >= 10:
                break
    return unique_ids


# ---------------------------------------------------------------------------
# List fluorophores
# ---------------------------------------------------------------------------

@router.get("/", response_model=PaginatedResponse[FluorophoreRead])
def list_fluorophores(
    skip: int = 0,
    limit: int = 100,
    type: str | None = None,
    search: str | None = None,
    has_spectra: bool | None = None,
    db: Session = Depends(get_db),
):
    limit = min(limit, 2000)
    stmt = select(Fluorophore)
    count_stmt = select(func.count()).select_from(Fluorophore)

    if type is not None:
        stmt = stmt.where(Fluorophore.fluor_type == type)
        count_stmt = count_stmt.where(Fluorophore.fluor_type == type)
    if search is not None and search.strip():
        pattern = "%" + search.strip() + "%"
        stmt = stmt.where(Fluorophore.name.ilike(pattern))
        count_stmt = count_stmt.where(Fluorophore.name.ilike(pattern))
    if has_spectra is not None:
        stmt = stmt.where(Fluorophore.has_spectra == has_spectra)
        count_stmt = count_stmt.where(Fluorophore.has_spectra == has_spectra)

    stmt = stmt.order_by(Fluorophore.name).offset(skip).limit(limit)
    items = list(db.scalars(stmt))
    total = db.scalar(count_stmt)
    return {"items": items, "total": total, "skip": skip, "limit": limit}


# ---------------------------------------------------------------------------
# Create user-defined fluorophore
# ---------------------------------------------------------------------------

@router.post("/", response_model=FluorophoreRead, status_code=201)
def create_fluorophore(
    data: FluorophoreCreate,
    db: Session = Depends(get_db),
):
    fl_id = str(uuid.uuid4())
    fluorophore = Fluorophore(
        id=fl_id,
        name=data.name,
        fluor_type=data.fluor_type,
        source=data.source,
        ex_max_nm=data.ex_max_nm,
        em_max_nm=data.em_max_nm,
        ext_coeff=data.ext_coeff,
        qy=data.qy,
        lifetime_ns=data.lifetime_ns,
        oligomerization=data.oligomerization,
        switch_type=data.switch_type,
        has_spectra=False,
    )
    db.add(fluorophore)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=409, detail="Fluorophore name already exists")
    db.refresh(fluorophore)
    return fluorophore


# ---------------------------------------------------------------------------
# FPbase catalog (live fetch from FPbase API — keep before /{id} routes)
# ---------------------------------------------------------------------------

@router.get("/fpbase-catalog", response_model=list[FpbaseCatalogItem])
async def fpbase_catalog():
    from services.fpbase import fetch_fpbase_catalog

    return await fetch_fpbase_catalog()


# ---------------------------------------------------------------------------
# Fetch single fluorophore from live FPbase API and upsert into DB
# ---------------------------------------------------------------------------

@router.post("/fetch-fpbase", response_model=FluorophoreRead)
async def fetch_fpbase_endpoint(
    request: FetchFpbaseRequest,
    db: Session = Depends(get_db),
):
    from services.fpbase import fetch_fluorophore_from_fpbase

    try:
        fpbase_data = await fetch_fluorophore_from_fpbase(request.name)
    except HTTPException as exc:
        if exc.status_code == 502:
            raise HTTPException(
                status_code=503,
                detail="Could not reach FPbase. Try again later.",
            )
        raise

    fl_id = fpbase_data["slug"]
    spectra = fpbase_data.get("spectra", {})
    has_spec = bool(spectra.get("EX") or spectra.get("EM"))

    existing = db.get(Fluorophore, fl_id)
    if existing is not None:
        existing.ex_max_nm = fpbase_data.get("ex_max_nm")
        existing.em_max_nm = fpbase_data.get("em_max_nm")
        existing.source = "fpbase"
        existing.has_spectra = has_spec
        db.execute(
            delete(FluorophoreSpectrum).where(
                FluorophoreSpectrum.fluorophore_id == existing.id
            )
        )
    else:
        # Also check by name in case the slug differs
        name_match = db.scalar(
            select(Fluorophore).where(Fluorophore.name == fpbase_data["name"])
        )
        if name_match is not None:
            name_match.ex_max_nm = fpbase_data.get("ex_max_nm")
            name_match.em_max_nm = fpbase_data.get("em_max_nm")
            name_match.source = "fpbase"
            name_match.has_spectra = has_spec
            db.execute(
                delete(FluorophoreSpectrum).where(
                    FluorophoreSpectrum.fluorophore_id == name_match.id
                )
            )
            existing = name_match
        else:
            existing = Fluorophore(
                id=fl_id,
                name=fpbase_data["name"],
                source="fpbase",
                ex_max_nm=fpbase_data.get("ex_max_nm"),
                em_max_nm=fpbase_data.get("em_max_nm"),
                has_spectra=has_spec,
            )
            db.add(existing)
            db.flush()

    for stype, points in spectra.items():
        for wl, intensity in points:
            db.add(
                FluorophoreSpectrum(
                    fluorophore_id=existing.id,
                    spectrum_type=stype,
                    wavelength_nm=wl,
                    intensity=intensity,
                )
            )

    db.commit()
    db.refresh(existing)
    return existing


# ---------------------------------------------------------------------------
# Batch fetch from live FPbase API
# ---------------------------------------------------------------------------

@router.post("/batch-fetch-fpbase", response_model=BatchFetchFpbaseResult)
async def batch_fetch_fpbase_endpoint(
    request: BatchFetchFpbaseRequest,
    db: Session = Depends(get_db),
):
    import asyncio

    from services.fpbase import fetch_fluorophore_from_fpbase

    if len(request.names) > 10:
        raise HTTPException(
            status_code=400,
            detail="Maximum 10 fluorophores per batch request",
        )

    fetched: list[Fluorophore] = []
    errors: list[dict] = []

    for i, name in enumerate(request.names):
        if i > 0:
            await asyncio.sleep(1)
        try:
            fpbase_data = await fetch_fluorophore_from_fpbase(name)
        except HTTPException as exc:
            errors.append({"name": name, "detail": exc.detail})
            continue

        fl_id = fpbase_data["slug"]
        spectra = fpbase_data.get("spectra", {})
        has_spec = bool(spectra.get("EX") or spectra.get("EM"))

        existing = db.get(Fluorophore, fl_id)
        if existing is not None:
            existing.ex_max_nm = fpbase_data.get("ex_max_nm")
            existing.em_max_nm = fpbase_data.get("em_max_nm")
            existing.source = "fpbase"
            existing.has_spectra = has_spec
            db.execute(
                delete(FluorophoreSpectrum).where(
                    FluorophoreSpectrum.fluorophore_id == existing.id
                )
            )
        else:
            existing = Fluorophore(
                id=fl_id,
                name=fpbase_data["name"],
                source="fpbase",
                ex_max_nm=fpbase_data.get("ex_max_nm"),
                em_max_nm=fpbase_data.get("em_max_nm"),
                has_spectra=has_spec,
            )
            db.add(existing)
            db.flush()

        for stype, points in spectra.items():
            for wl, intensity in points:
                db.add(
                    FluorophoreSpectrum(
                        fluorophore_id=existing.id,
                        spectrum_type=stype,
                        wavelength_nm=wl,
                        intensity=intensity,
                    )
                )
        db.commit()
        db.refresh(existing)
        fetched.append(existing)

    return {"fetched": fetched, "errors": errors}


# ---------------------------------------------------------------------------
# Batch spectra (POST /spectra/batch)
# ---------------------------------------------------------------------------

@router.post("/spectra/batch")
def batch_spectra(
    request: BatchSpectraRequest,
    db: Session = Depends(get_db),
):
    if len(request.ids) > 2000:
        raise HTTPException(status_code=400, detail="Maximum 2000 IDs per request")

    types = request.types if request.types else ["EX", "EM"]

    rows = db.execute(
        select(
            FluorophoreSpectrum.fluorophore_id,
            FluorophoreSpectrum.spectrum_type,
            FluorophoreSpectrum.wavelength_nm,
            FluorophoreSpectrum.intensity,
        )
        .where(FluorophoreSpectrum.fluorophore_id.in_(request.ids))
        .where(FluorophoreSpectrum.spectrum_type.in_(types))
        .order_by(
            FluorophoreSpectrum.fluorophore_id,
            FluorophoreSpectrum.spectrum_type,
            FluorophoreSpectrum.wavelength_nm,
        )
    ).all()

    result: dict[str, dict[str, list[list[float]]]] = {}
    for fl_id, stype, wl, intensity in rows:
        if fl_id not in result:
            result[fl_id] = {}
        if stype not in result[fl_id]:
            result[fl_id][stype] = []
        result[fl_id][stype].append([wl, intensity])

    return result


# ---------------------------------------------------------------------------
# Bulk import (upload preview + confirm) — MUST be before /{id} routes
# ---------------------------------------------------------------------------

@router.post("/import/upload", response_model=FluorophoreImportPreview)
async def upload_fluorophores_for_import(
    file: UploadFile = FastAPIFile(...),
    db: Session = Depends(get_db),
):
    """Upload a CSV or JSON file of fluorophores. Returns a preview for user review."""
    content_bytes = await file.read()
    try:
        content = content_bytes.decode("utf-8")
    except UnicodeDecodeError:
        content = content_bytes.decode("latin-1")

    filename = (file.filename or "").lower()

    if filename.endswith(".json"):
        return parse_json(content, db)
    elif filename.endswith(".csv"):
        return parse_csv(content, db)
    else:
        stripped = content.strip()
        if stripped.startswith("{") or stripped.startswith("["):
            return parse_json(content, db)
        return parse_csv(content, db)


@router.post("/import/confirm", response_model=FluorophoreImportConfirmResponse)
def confirm_fluorophore_import(
    body: FluorophoreImportConfirmRequest,
    db: Session = Depends(get_db),
):
    """Confirm and create fluorophores from a reviewed import."""
    created, skipped, errors = do_confirm_import(body.items, db)
    return FluorophoreImportConfirmResponse(
        created=created,
        skipped=skipped,
        errors=errors,
    )


# ---------------------------------------------------------------------------
# Fluorophore favorite toggle
# ---------------------------------------------------------------------------

@router.patch("/{id}/favorite")
def toggle_fluorophore_favorite(
    id: str,
    body: dict,
    db: Session = Depends(get_db),
):
    fl = db.get(Fluorophore, id)
    if fl is None:
        raise HTTPException(status_code=404, detail="Fluorophore not found")
    fl.is_favorite = bool(body.get("is_favorite", False))
    db.commit()
    db.refresh(fl)
    return {
        "id": fl.id,
        "name": fl.name,
        "is_favorite": fl.is_favorite,
    }


# ---------------------------------------------------------------------------
# Single fluorophore spectra
# ---------------------------------------------------------------------------

@router.get("/{id}/spectra", response_model=FluorophoreSpectraResponse)
def get_fluorophore_spectra(
    id: str,
    types: str = "EX,EM",
    db: Session = Depends(get_db),
):
    fluorophore = db.get(Fluorophore, id)
    if fluorophore is None:
        raise HTTPException(status_code=404, detail="Fluorophore not found")

    type_list = [t.strip() for t in types.split(",") if t.strip()]
    spectra_map = load_spectra_for(id, type_list, db)

    spectra_out: dict[str, list[list[float]]] = {
        stype: [[wl, intensity] for wl, intensity in points]
        for stype, points in spectra_map.items()
    }

    return {
        "fluorophore_id": id,
        "name": fluorophore.name,
        "spectra": spectra_out,
    }


# ---------------------------------------------------------------------------
# Instrument compatibility
# ---------------------------------------------------------------------------

@router.get("/{id}/instrument-compatibility", response_model=InstrumentCompatibilityResponse)
def get_instrument_compatibility(
    id: str,
    db: Session = Depends(get_db),
):
    fluorophore = db.get(Fluorophore, id)
    if fluorophore is None:
        raise HTTPException(status_code=404, detail="Fluorophore not found")

    # Load EX and EM spectra for this fluorophore
    spectra_map = load_spectra_for(id, ["EX", "EM", "AB"], db)
    ex_spectra = spectra_map.get("EX") or spectra_map.get("AB") or []
    em_spectra = spectra_map.get("EM") or []

    # Pre-compute total EM integral for collection efficiency normalization
    em_total = 0.0
    if em_spectra:
        low = em_spectra[0][0]
        high = em_spectra[-1][0]
        em_total = integrate_bandpass(em_spectra, low, high)

    # Fetch all instruments with their lasers and detectors
    instruments = list(
        db.scalars(select(Instrument).order_by(Instrument.name))
    )

    compatibilities: list[InstrumentCompatibility] = []
    for inst in instruments:
        lasers = list(
            db.scalars(
                select(Laser)
                .where(Laser.instrument_id == inst.id)
                .order_by(Laser.wavelength_nm)
            )
        )

        laser_lines: list[LaserCompatibility] = []
        for laser in lasers:
            ex_eff = interpolate_at(ex_spectra, float(laser.wavelength_nm))
            laser_lines.append(
                LaserCompatibility(
                    wavelength_nm=laser.wavelength_nm,
                    excitation_efficiency=round(ex_eff, 4),
                )
            )

        detector_rows: list[DetectorCompatibility] = []
        for laser in lasers:
            detectors = list(
                db.scalars(
                    select(Detector)
                    .where(Detector.laser_id == laser.id)
                    .order_by(Detector.filter_midpoint)
                )
            )
            for det in detectors:
                low = det.filter_midpoint - det.filter_width / 2
                high = det.filter_midpoint + det.filter_width / 2
                bandpass_integral = integrate_bandpass(em_spectra, low, high)
                coll_eff = (bandpass_integral / em_total) if em_total > 0 else 0.0
                detector_rows.append(
                    DetectorCompatibility(
                        name=det.name,
                        center_nm=det.filter_midpoint,
                        bandwidth_nm=det.filter_width,
                        collection_efficiency=round(coll_eff, 4),
                        laser_wavelength_nm=laser.wavelength_nm,
                    )
                )

        compatibilities.append(
            InstrumentCompatibility(
                instrument_id=inst.id,
                instrument_name=inst.name,
                laser_lines=laser_lines,
                detectors=detector_rows,
            )
        )

    return InstrumentCompatibilityResponse(
        fluorophore_id=id,
        instrument_compatibilities=compatibilities,
    )
