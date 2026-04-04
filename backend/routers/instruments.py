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
from models import Detector
from models import Fluorophore
from models import FluorophoreSpectrum
from models import Instrument
from models import InstrumentView
from models import Laser
from models import Panel
from models import PanelAssignment
from models import UserPreference
from schemas import DetectorCompatibilityResponse
from schemas import FavoriteToggle
from schemas import FluorophoreCompatibilityDetail
from schemas import InstrumentCreate
from schemas import InstrumentExport
from schemas import InstrumentRead
from schemas import InstrumentUpdate
from schemas import PaginatedResponse
from services.spectra import integrate_bandpass
from services.spectra import interpolate_at

router = APIRouter()

_compat_cache: dict[str, tuple[str, DetectorCompatibilityResponse]] = {}

def _get_cache_token(db: Session, instrument: Instrument) -> str:
    fl_count = db.scalar(select(func.count()).select_from(Fluorophore)) or 0
    fs_count = db.scalar(select(func.count()).select_from(FluorophoreSpectrum)) or 0
    inst_hash = f"{instrument.name}-"
    for laser in instrument.lasers:
        inst_hash += f"{laser.id}{laser.wavelength_nm}"
        for det in laser.detectors:
            inst_hash += f"{det.id}{det.filter_midpoint}{det.filter_width}"
    return f"{fl_count}-{fs_count}-{inst_hash}"



def _load_instrument(db: Session, instrument_id: str) -> Instrument:
    stmt = (
        select(Instrument)
        .options(selectinload(Instrument.lasers).selectinload(Laser.detectors))
        .where(Instrument.id == instrument_id)
    )
    instrument = db.scalars(stmt).first()
    if instrument is None:
        raise HTTPException(status_code=404, detail="Instrument not found")
    return instrument


@router.get("/", response_model=PaginatedResponse[InstrumentRead])
def list_instruments(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    limit = min(limit, 500)
    stmt = (
        select(Instrument)
        .options(selectinload(Instrument.lasers).selectinload(Laser.detectors))
        .offset(skip)
        .limit(limit)
    )
    items = list(db.scalars(stmt).unique())
    total = db.scalar(select(func.count()).select_from(Instrument))
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("/", response_model=InstrumentRead, status_code=201)
def create_instrument(
    data: InstrumentCreate,
    db: Session = Depends(get_db),
):
    instrument = Instrument(name=data.name, location=data.location)
    db.add(instrument)
    db.flush()

    for laser_data in data.lasers:
        laser = Laser(
            instrument_id=instrument.id,
            wavelength_nm=laser_data.wavelength_nm,
            name=laser_data.name,
        )
        db.add(laser)
        db.flush()
        for det_data in laser_data.detectors:
            detector = Detector(
                laser_id=laser.id,
                filter_midpoint=det_data.filter_midpoint,
                filter_width=det_data.filter_width,
                name=det_data.name,
            )
            db.add(detector)

    db.commit()
    return _load_instrument(db, instrument.id)


@router.patch("/{id}/favorite", response_model=InstrumentRead)
def toggle_instrument_favorite(
    id: str,
    data: FavoriteToggle,
    db: Session = Depends(get_db),
):
    instrument = db.get(Instrument, id)
    if instrument is None:
        raise HTTPException(status_code=404, detail="Instrument not found")
    instrument.is_favorite = data.is_favorite
    db.commit()
    return _load_instrument(db, id)


@router.post("/{id}/view", status_code=204)
def record_instrument_view(id: str, db: Session = Depends(get_db)):
    instrument = db.get(Instrument, id)
    if instrument is None:
        raise HTTPException(status_code=404, detail="Instrument not found")
    view = InstrumentView(instrument_id=id)
    db.add(view)
    db.commit()


@router.get("/recent", response_model=list[str])
def get_recent_instruments(
    limit: int = 10,
    db: Session = Depends(get_db),
):
    """Return recent instrument IDs merged from recent panels and explicit views."""
    panel_stmt = (
        select(Panel.instrument_id, Panel.updated_at)
        .where(Panel.instrument_id.is_not(None))
        .order_by(Panel.updated_at.desc())
        .limit(20)
    )
    panel_rows = db.execute(panel_stmt).all()

    view_stmt = (
        select(
            InstrumentView.instrument_id,
            func.max(InstrumentView.viewed_at).label("last_viewed"),
        )
        .group_by(InstrumentView.instrument_id)
        .order_by(func.max(InstrumentView.viewed_at).desc())
        .limit(20)
    )
    view_rows = db.execute(view_stmt).all()

    timestamps: dict[str, datetime] = {}
    for inst_id, ts in panel_rows:
        if ts is not None and (inst_id not in timestamps or ts > timestamps[inst_id]):
            timestamps[inst_id] = ts
    for inst_id, ts in view_rows:
        if ts is not None and (inst_id not in timestamps or ts > timestamps[inst_id]):
            timestamps[inst_id] = ts

    sorted_ids = sorted(timestamps.keys(), key=lambda x: timestamps[x], reverse=True)
    return sorted_ids[:limit]


@router.get("/{id}", response_model=InstrumentRead)
def get_instrument(id: str, db: Session = Depends(get_db)):
    return _load_instrument(db, id)


@router.put("/{id}", response_model=InstrumentRead)
def update_instrument(
    id: str,
    data: InstrumentUpdate,
    db: Session = Depends(get_db),
):
    instrument = _load_instrument(db, id)

    # Check if any existing detectors are referenced by assignments
    existing_detector_ids = []
    for laser in instrument.lasers:
        for det in laser.detectors:
            existing_detector_ids.append(det.id)

    if existing_detector_ids:
        in_use = (
            db.execute(
                select(PanelAssignment.detector_id, PanelAssignment.panel_id)
                .where(PanelAssignment.detector_id.in_(existing_detector_ids))
            )
            .all()
        )
        if in_use:
            details = [
                "detector %s used by panel %s" % (row[0], row[1])
                for row in in_use
            ]
            raise HTTPException(
                status_code=409,
                detail="Cannot update instrument: detectors in use by panel assignments. %s"
                % "; ".join(details),
            )

    # Delete old lasers (cascades to detectors)
    for laser in list(instrument.lasers):
        db.delete(laser)
    db.flush()

    # Update name/location and create new lasers/detectors
    instrument.name = data.name
    instrument.location = data.location
    for laser_data in data.lasers:
        laser = Laser(
            instrument_id=instrument.id,
            wavelength_nm=laser_data.wavelength_nm,
            name=laser_data.name,
        )
        db.add(laser)
        db.flush()
        for det_data in laser_data.detectors:
            detector = Detector(
                laser_id=laser.id,
                filter_midpoint=det_data.filter_midpoint,
                filter_width=det_data.filter_width,
                name=det_data.name,
            )
            db.add(detector)

    db.commit()
    return _load_instrument(db, instrument.id)


@router.delete("/{id}", status_code=204)
def delete_instrument(id: str, db: Session = Depends(get_db)):
    instrument = db.get(Instrument, id)
    if instrument is None:
        raise HTTPException(status_code=404, detail="Instrument not found")
    db.delete(instrument)
    db.commit()


@router.get("/{id}/export", response_model=InstrumentExport)
def export_instrument(id: str, db: Session = Depends(get_db)):
    instrument = _load_instrument(db, id)
    return InstrumentExport(
        name=instrument.name,
        lasers=[
            {
                "wavelength_nm": laser.wavelength_nm,
                "name": laser.name,
                "detectors": [
                    {
                        "filter_midpoint": det.filter_midpoint,
                        "filter_width": det.filter_width,
                        "name": det.name,
                    }
                    for det in laser.detectors
                ],
            }
            for laser in instrument.lasers
        ],
    )


@router.post("/import", response_model=InstrumentRead, status_code=201)
def import_instrument(
    data: InstrumentExport,
    db: Session = Depends(get_db),
):
    instrument = Instrument(name=data.name)
    db.add(instrument)
    db.flush()

    for laser_data in data.lasers:
        laser = Laser(
            instrument_id=instrument.id,
            wavelength_nm=laser_data.wavelength_nm,
            name=laser_data.name,
        )
        db.add(laser)
        db.flush()
        for det_data in laser_data.detectors:
            detector = Detector(
                laser_id=laser.id,
                filter_midpoint=det_data.filter_midpoint,
                filter_width=det_data.filter_width,
                name=det_data.name,
            )
            db.add(detector)

    db.commit()
    return _load_instrument(db, instrument.id)


@router.get("/{id}/fluorophore-compatibility", response_model=DetectorCompatibilityResponse)
def get_fluorophore_compatibility(
    id: str,
    min_excitation_pct: int | None = None,
    min_detection_pct: int | None = None,
    db: Session = Depends(get_db),
):
    instrument = _load_instrument(db, id)
    token = _get_cache_token(db, instrument)

    if min_excitation_pct is None:
        p = db.get(UserPreference, "min_excitation_pct")
        min_excitation_pct = int(p.value) if p else 5
    if min_detection_pct is None:
        p = db.get(UserPreference, "min_detection_pct")
        min_detection_pct = int(p.value) if p else 10

    cache_key = f"{id}-{token}-{min_excitation_pct}-{min_detection_pct}"
    if cache_key in _compat_cache:
        return _compat_cache[cache_key][1]

    # Calculate
    from collections import defaultdict
    fl_spectra = defaultdict(lambda: defaultdict(list))
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
    
    # Pre-calculate totals for emission
    em_totals = {}
    for fl in fluorophores:
        em_spectra = fl_spectra[fl.id].get("EM", [])
        if em_spectra:
            em_totals[fl.id] = integrate_bandpass(em_spectra, em_spectra[0][0], em_spectra[-1][0])
        else:
            em_totals[fl.id] = 0.0

    compatibility_map: dict[str, list[FluorophoreCompatibilityDetail]] = defaultdict(list)

    for laser in instrument.lasers:
        laser_wl = laser.wavelength_nm
        for fl in fluorophores:
            # Ex efficiency
            ex_spectra = fl_spectra[fl.id].get("EX") or fl_spectra[fl.id].get("AB") or []
            ex_eff = 0.0
            if ex_spectra:
                ex_eff = interpolate_at(ex_spectra, float(laser_wl))
                peak = max(p[1] for p in ex_spectra)
                ex_eff = (ex_eff / peak) if peak > 0 else 0.0
            else:
                if fl.ex_max_nm is not None and abs(fl.ex_max_nm - laser_wl) <= 40:
                    ex_eff = 1.0
            
            if ex_eff < (min_excitation_pct / 100.0):
                continue

            # Det efficiency
            em_spectra = fl_spectra[fl.id].get("EM", [])
            em_total = em_totals[fl.id]

            for det in laser.detectors:
                det_eff = 0.0
                if em_spectra and em_total > 0:
                    low = det.filter_midpoint - det.filter_width / 2
                    high = det.filter_midpoint + det.filter_width / 2
                    bandpass_integral = integrate_bandpass(em_spectra, low, high)
                    det_eff = bandpass_integral / em_total
                else:
                    if fl.em_max_nm is not None:
                        if det.filter_midpoint - det.filter_width <= fl.em_max_nm <= det.filter_midpoint + det.filter_width:
                            det_eff = 1.0
                
                if det_eff >= (min_detection_pct / 100.0):
                    compatibility_map[det.id].append(
                        FluorophoreCompatibilityDetail(
                            fluorophore_id=fl.id,
                            name=fl.name,
                            excitation_efficiency=round(ex_eff, 4),
                            detection_efficiency=round(det_eff, 4),
                            is_favorite=fl.is_favorite
                        )
                    )

    resp = DetectorCompatibilityResponse(
        instrument_id=id,
        min_excitation_pct=min_excitation_pct,
        min_detection_pct=min_detection_pct,
        compatibility=dict(compatibility_map),
    )
    _compat_cache[cache_key] = (token, resp)
    return resp

