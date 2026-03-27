from __future__ import annotations

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm import selectinload

from database import get_db
from models import Detector
from models import Instrument
from models import Laser
from models import PanelAssignment
from schemas import InstrumentCreate
from schemas import InstrumentRead
from schemas import InstrumentUpdate
from schemas import PaginatedResponse

router = APIRouter()


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

    # Update name and create new lasers/detectors
    instrument.name = data.name
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
