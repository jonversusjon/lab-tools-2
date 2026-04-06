from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm import selectinload

from database import get_db
from models import Fluorophore
from models import FluorophoreSpectrum
from models import IFPanel
from models import IFPanelAssignment
from models import Microscope
from models import MicroscopeFilter
from models import MicroscopeLaser
from models import MicroscopeView
from models import UserPreference
from schemas import DetectorCompatibilityResponse
from schemas import FavoriteToggle
from schemas import FluorophoreCompatibilityDetail
from schemas import MicroscopeCreate
from schemas import MicroscopeExport
from schemas import MicroscopeRead
from schemas import MicroscopeUpdate
from schemas import PaginatedResponse
from services.spectra import integrate_bandpass
from services.spectra import interpolate_at

router = APIRouter()

_microscope_compat_cache: dict[str, tuple[str, DetectorCompatibilityResponse]] = {}


def _get_microscope_cache_token(db: Session, microscope: Microscope) -> str:
    fl_count = db.scalar(select(func.count()).select_from(Fluorophore)) or 0
    fs_count = db.scalar(select(func.count()).select_from(FluorophoreSpectrum)) or 0
    scope_hash = "%s-" % microscope.name
    for laser in microscope.lasers:
        scope_hash += "%s%s" % (laser.id, laser.wavelength_nm)
        for filt in laser.filters:
            scope_hash += "%s%s%s" % (filt.id, filt.filter_midpoint, filt.filter_width)
    return "%s-%s-%s" % (fl_count, fs_count, scope_hash)


def _load_microscope(db: Session, microscope_id: str) -> Microscope:
    stmt = (
        select(Microscope)
        .options(selectinload(Microscope.lasers).selectinload(MicroscopeLaser.filters))
        .where(Microscope.id == microscope_id)
    )
    microscope = db.scalars(stmt).first()
    if microscope is None:
        raise HTTPException(status_code=404, detail="Microscope not found")
    return microscope


@router.get("/", response_model=PaginatedResponse[MicroscopeRead])
def list_microscopes(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    limit = min(limit, 500)
    stmt = (
        select(Microscope)
        .options(selectinload(Microscope.lasers).selectinload(MicroscopeLaser.filters))
        .offset(skip)
        .limit(limit)
    )
    items = list(db.scalars(stmt).unique())
    total = db.scalar(select(func.count()).select_from(Microscope))
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("/", response_model=MicroscopeRead, status_code=201)
def create_microscope(
    data: MicroscopeCreate,
    db: Session = Depends(get_db),
):
    microscope = Microscope(name=data.name, location=data.location)
    db.add(microscope)
    db.flush()

    for laser_data in data.lasers:
        laser = MicroscopeLaser(
            microscope_id=microscope.id,
            wavelength_nm=laser_data.wavelength_nm,
            name=laser_data.name,
            excitation_type=laser_data.excitation_type,
            ex_filter_width=laser_data.ex_filter_width,
        )
        db.add(laser)
        db.flush()
        for filt_data in laser_data.filters:
            filt = MicroscopeFilter(
                laser_id=laser.id,
                filter_midpoint=filt_data.filter_midpoint,
                filter_width=filt_data.filter_width,
                name=filt_data.name,
            )
            db.add(filt)

    db.commit()
    return _load_microscope(db, microscope.id)


@router.patch("/{id}/favorite", response_model=MicroscopeRead)
def toggle_microscope_favorite(
    id: str,
    data: FavoriteToggle,
    db: Session = Depends(get_db),
):
    microscope = db.get(Microscope, id)
    if microscope is None:
        raise HTTPException(status_code=404, detail="Microscope not found")
    microscope.is_favorite = data.is_favorite
    db.commit()
    return _load_microscope(db, id)


@router.post("/{id}/view", status_code=204)
def record_microscope_view(id: str, db: Session = Depends(get_db)):
    microscope = db.get(Microscope, id)
    if microscope is None:
        raise HTTPException(status_code=404, detail="Microscope not found")
    view = MicroscopeView(microscope_id=id)
    db.add(view)
    db.commit()


@router.get("/recent", response_model=list[str])
def get_recent_microscopes(
    limit: int = 10,
    db: Session = Depends(get_db),
):
    """Return recent microscope IDs merged from recent IF panels and explicit views."""
    panel_stmt = (
        select(IFPanel.microscope_id, IFPanel.updated_at)
        .where(IFPanel.microscope_id.is_not(None))
        .order_by(IFPanel.updated_at.desc())
        .limit(20)
    )
    panel_rows = db.execute(panel_stmt).all()

    view_stmt = (
        select(
            MicroscopeView.microscope_id,
            func.max(MicroscopeView.viewed_at).label("last_viewed"),
        )
        .group_by(MicroscopeView.microscope_id)
        .order_by(func.max(MicroscopeView.viewed_at).desc())
        .limit(20)
    )
    view_rows = db.execute(view_stmt).all()

    timestamps: dict[str, datetime] = {}
    for microscope_id, ts in panel_rows:
        if ts is not None and (microscope_id not in timestamps or ts > timestamps[microscope_id]):
            timestamps[microscope_id] = ts
    for microscope_id, ts in view_rows:
        if ts is not None and (microscope_id not in timestamps or ts > timestamps[microscope_id]):
            timestamps[microscope_id] = ts

    sorted_ids = sorted(timestamps.keys(), key=lambda x: timestamps[x], reverse=True)
    return sorted_ids[:limit]


@router.get("/{id}", response_model=MicroscopeRead)
def get_microscope(id: str, db: Session = Depends(get_db)):
    return _load_microscope(db, id)


@router.put("/{id}", response_model=MicroscopeRead)
def update_microscope(
    id: str,
    data: MicroscopeUpdate,
    db: Session = Depends(get_db),
):
    microscope = _load_microscope(db, id)

    # Check if any existing filters are referenced by IF panel assignments
    existing_filter_ids = []
    for laser in microscope.lasers:
        for filt in laser.filters:
            existing_filter_ids.append(filt.id)

    if existing_filter_ids:
        in_use = (
            db.execute(
                select(IFPanelAssignment.filter_id, IFPanelAssignment.panel_id)
                .where(IFPanelAssignment.filter_id.in_(existing_filter_ids))
            )
            .all()
        )
        if in_use:
            details = [
                "filter %s used by panel %s" % (row[0], row[1])
                for row in in_use
            ]
            raise HTTPException(
                status_code=409,
                detail="Cannot update microscope: filters in use by IF panel assignments. %s"
                % "; ".join(details),
            )

    # Delete old lasers (cascades to filters)
    for laser in list(microscope.lasers):
        db.delete(laser)
    db.flush()

    # Update name/location and create new lasers/filters
    microscope.name = data.name
    microscope.location = data.location
    for laser_data in data.lasers:
        laser = MicroscopeLaser(
            microscope_id=microscope.id,
            wavelength_nm=laser_data.wavelength_nm,
            name=laser_data.name,
            excitation_type=laser_data.excitation_type,
            ex_filter_width=laser_data.ex_filter_width,
        )
        db.add(laser)
        db.flush()
        for filt_data in laser_data.filters:
            filt = MicroscopeFilter(
                laser_id=laser.id,
                filter_midpoint=filt_data.filter_midpoint,
                filter_width=filt_data.filter_width,
                name=filt_data.name,
            )
            db.add(filt)

    db.commit()
    return _load_microscope(db, microscope.id)


@router.delete("/{id}", status_code=204)
def delete_microscope(id: str, db: Session = Depends(get_db)):
    microscope = db.get(Microscope, id)
    if microscope is None:
        raise HTTPException(status_code=404, detail="Microscope not found")
    db.delete(microscope)
    db.commit()


@router.get("/{id}/export", response_model=MicroscopeExport)
def export_microscope(id: str, db: Session = Depends(get_db)):
    microscope = _load_microscope(db, id)
    return MicroscopeExport(
        name=microscope.name,
        location=microscope.location,
        lasers=[
            {
                "wavelength_nm": laser.wavelength_nm,
                "name": laser.name,
                "filters": [
                    {
                        "filter_midpoint": filt.filter_midpoint,
                        "filter_width": filt.filter_width,
                        "name": filt.name,
                    }
                    for filt in laser.filters
                ],
            }
            for laser in microscope.lasers
        ],
    )


@router.get("/{id}/fluorophore-compatibility", response_model=DetectorCompatibilityResponse)
def get_microscope_fluorophore_compatibility(
    id: str,
    min_excitation_pct: int | None = None,
    min_detection_pct: int | None = None,
    db: Session = Depends(get_db),
):
    microscope = _load_microscope(db, id)
    token = _get_microscope_cache_token(db, microscope)

    if min_excitation_pct is None:
        p = db.get(UserPreference, "min_excitation_pct")
        min_excitation_pct = int(p.value) if p else 5
    if min_detection_pct is None:
        p = db.get(UserPreference, "min_detection_pct")
        min_detection_pct = int(p.value) if p else 10

    cache_key = "%s-%s-%s-%s" % (id, token, min_excitation_pct, min_detection_pct)
    if cache_key in _microscope_compat_cache:
        return _microscope_compat_cache[cache_key][1]

    from collections import defaultdict
    fl_spectra: dict[str, dict[str, list[tuple[float, float]]]] = defaultdict(lambda: defaultdict(list))
    spectra_rows = db.execute(
        select(
            FluorophoreSpectrum.fluorophore_id,
            FluorophoreSpectrum.spectrum_type,
            FluorophoreSpectrum.wavelength_nm,
            FluorophoreSpectrum.intensity,
        )
        .where(FluorophoreSpectrum.spectrum_type.in_(["EX", "EM", "AB"]))
        .order_by(
            FluorophoreSpectrum.fluorophore_id,
            FluorophoreSpectrum.spectrum_type,
            FluorophoreSpectrum.wavelength_nm,
        )
    ).all()
    for fl_id, stype, wl, intensity in spectra_rows:
        fl_spectra[fl_id][stype].append((wl, intensity))

    fluorophores = list(db.scalars(select(Fluorophore)))

    em_totals: dict[str, float] = {}
    for fl in fluorophores:
        em_spectra = fl_spectra[fl.id].get("EM", [])
        if em_spectra:
            em_totals[fl.id] = integrate_bandpass(em_spectra, em_spectra[0][0], em_spectra[-1][0])
        else:
            em_totals[fl.id] = 0.0

    compatibility_map: dict[str, list[FluorophoreCompatibilityDetail]] = defaultdict(list)

    for laser in microscope.lasers:
        laser_wl = laser.wavelength_nm
        is_arc = getattr(laser, "excitation_type", "laser") == "arc"
        ex_filter_width = getattr(laser, "ex_filter_width", None)

        for fl in fluorophores:
            ex_spectra = fl_spectra[fl.id].get("EX") or fl_spectra[fl.id].get("AB") or []
            ex_eff = 0.0
            if is_arc and ex_filter_width and ex_filter_width > 0:
                # Arc lamp / LED: integrate excitation spectrum over the bandpass filter
                if ex_spectra:
                    low = laser_wl - ex_filter_width / 2
                    high = laser_wl + ex_filter_width / 2
                    peak = max(p[1] for p in ex_spectra)
                    if peak > 0:
                        ex_passband = integrate_bandpass(ex_spectra, low, high)
                        full_range = integrate_bandpass(ex_spectra, ex_spectra[0][0], ex_spectra[-1][0])
                        ex_eff = (ex_passband / full_range) if full_range > 0 else 0.0
                else:
                    if fl.ex_max_nm is not None and abs(fl.ex_max_nm - laser_wl) <= ex_filter_width / 2:
                        ex_eff = 1.0
            else:
                # Laser: single wavelength
                if ex_spectra:
                    ex_eff = interpolate_at(ex_spectra, float(laser_wl))
                    peak = max(p[1] for p in ex_spectra)
                    ex_eff = (ex_eff / peak) if peak > 0 else 0.0
                else:
                    if fl.ex_max_nm is not None and abs(fl.ex_max_nm - laser_wl) <= 40:
                        ex_eff = 1.0

            if ex_eff < (min_excitation_pct / 100.0):
                continue

            em_spectra = fl_spectra[fl.id].get("EM", [])
            em_total = em_totals[fl.id]

            for filt in laser.filters:
                det_eff = 0.0
                if em_spectra and em_total > 0:
                    low = filt.filter_midpoint - filt.filter_width / 2
                    high = filt.filter_midpoint + filt.filter_width / 2
                    bandpass_integral = integrate_bandpass(em_spectra, low, high)
                    det_eff = bandpass_integral / em_total
                else:
                    if fl.em_max_nm is not None:
                        if filt.filter_midpoint - filt.filter_width <= fl.em_max_nm <= filt.filter_midpoint + filt.filter_width:
                            det_eff = 1.0

                if det_eff >= (min_detection_pct / 100.0):
                    compatibility_map[filt.id].append(
                        FluorophoreCompatibilityDetail(
                            fluorophore_id=fl.id,
                            name=fl.name,
                            excitation_efficiency=round(ex_eff, 4),
                            detection_efficiency=round(det_eff, 4),
                            is_favorite=fl.is_favorite,
                        )
                    )

    resp = DetectorCompatibilityResponse(
        instrument_id=id,
        min_excitation_pct=min_excitation_pct,
        min_detection_pct=min_detection_pct,
        compatibility=dict(compatibility_map),
    )
    _microscope_compat_cache[cache_key] = (token, resp)
    return resp


@router.post("/import", response_model=MicroscopeRead, status_code=201)
def import_microscope(
    data: MicroscopeExport,
    db: Session = Depends(get_db),
):
    microscope = Microscope(name=data.name, location=data.location)
    db.add(microscope)
    db.flush()

    for laser_data in data.lasers:
        laser = MicroscopeLaser(
            microscope_id=microscope.id,
            wavelength_nm=laser_data.wavelength_nm,
            name=laser_data.name,
            excitation_type=laser_data.excitation_type,
            ex_filter_width=laser_data.ex_filter_width,
        )
        db.add(laser)
        db.flush()
        for filt_data in laser_data.filters:
            filt = MicroscopeFilter(
                laser_id=laser.id,
                filter_midpoint=filt_data.filter_midpoint,
                filter_width=filt_data.filter_width,
                name=filt_data.name,
            )
            db.add(filt)

    db.commit()
    return _load_microscope(db, microscope.id)
