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
from models import IFPanel
from models import IFPanelAssignment
from models import Microscope
from models import MicroscopeFilter
from models import MicroscopeLaser
from models import MicroscopeView
from schemas import FavoriteToggle
from schemas import MicroscopeCreate
from schemas import MicroscopeExport
from schemas import MicroscopeRead
from schemas import MicroscopeUpdate
from schemas import PaginatedResponse

router = APIRouter()


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
