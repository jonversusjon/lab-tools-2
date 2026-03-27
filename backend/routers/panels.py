from __future__ import annotations

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session
from sqlalchemy.orm import selectinload

from database import get_db
from models import Antibody
from models import Detector
from models import Fluorophore
from models import Instrument
from models import Laser
from models import Panel
from models import PanelAssignment
from models import PanelTarget
from schemas import PaginatedResponse
from schemas import PanelAssignmentCreate
from schemas import PanelAssignmentRead
from schemas import PanelCreate
from schemas import PanelListRead
from schemas import PanelRead
from schemas import PanelTargetCreate
from schemas import PanelTargetRead
from schemas import PanelUpdate

router = APIRouter()


def _load_panel(db: Session, panel_id: str) -> Panel:
    stmt = (
        select(Panel)
        .options(
            selectinload(Panel.targets),
            selectinload(Panel.assignments),
        )
        .where(Panel.id == panel_id)
    )
    panel = db.scalars(stmt).first()
    if panel is None:
        raise HTTPException(status_code=404, detail="Panel not found")
    return panel


@router.get("/", response_model=PaginatedResponse[PanelListRead])
def list_panels(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    limit = min(limit, 500)
    stmt = (
        select(Panel)
        .options(
            selectinload(Panel.targets),
            selectinload(Panel.assignments),
        )
        .offset(skip)
        .limit(limit)
    )
    panels = list(db.scalars(stmt).unique())
    total = db.scalar(select(func.count()).select_from(Panel))
    items = []
    for p in panels:
        items.append({
            "id": p.id,
            "name": p.name,
            "instrument_id": p.instrument_id,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
            "target_count": len(p.targets),
            "assignment_count": len(p.assignments),
        })
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("/", response_model=PanelRead, status_code=201)
def create_panel(
    data: PanelCreate,
    db: Session = Depends(get_db),
):
    if data.instrument_id is not None:
        instrument = db.get(Instrument, data.instrument_id)
        if instrument is None:
            raise HTTPException(status_code=404, detail="Instrument not found")

    panel = Panel(name=data.name, instrument_id=data.instrument_id)
    db.add(panel)
    db.commit()
    return _load_panel(db, panel.id)


@router.get("/{id}", response_model=PanelRead)
def get_panel(id: str, db: Session = Depends(get_db)):
    return _load_panel(db, id)


@router.put("/{id}", response_model=PanelRead)
def update_panel(
    id: str,
    data: PanelUpdate,
    db: Session = Depends(get_db),
):
    panel = _load_panel(db, id)

    if data.instrument_id is not None:
        instrument = db.get(Instrument, data.instrument_id)
        if instrument is None:
            raise HTTPException(status_code=404, detail="Instrument not found")

    # If instrument_id changes, delete all assignments (but keep targets)
    instrument_changed = panel.instrument_id != data.instrument_id
    if instrument_changed:
        db.execute(
            PanelAssignment.__table__.delete().where(
                PanelAssignment.panel_id == panel.id
            )
        )

    panel.name = data.name
    panel.instrument_id = data.instrument_id
    db.commit()
    return _load_panel(db, panel.id)


@router.delete("/{id}", status_code=204)
def delete_panel(id: str, db: Session = Depends(get_db)):
    panel = db.get(Panel, id)
    if panel is None:
        raise HTTPException(status_code=404, detail="Panel not found")
    db.delete(panel)
    db.commit()


@router.post("/{id}/targets", response_model=PanelTargetRead, status_code=201)
def add_target(
    id: str,
    data: PanelTargetCreate,
    db: Session = Depends(get_db),
):
    panel = db.get(Panel, id)
    if panel is None:
        raise HTTPException(status_code=404, detail="Panel not found")

    antibody = db.get(Antibody, data.antibody_id)
    if antibody is None:
        raise HTTPException(status_code=404, detail="Antibody not found")

    # Check if already a target (app-level for user-friendly message)
    existing = db.scalar(
        select(PanelTarget.id).where(
            PanelTarget.panel_id == id,
            PanelTarget.antibody_id == data.antibody_id,
        )
    )
    if existing is not None:
        raise HTTPException(
            status_code=409, detail="Antibody already a target in this panel"
        )

    target = PanelTarget(panel_id=id, antibody_id=data.antibody_id)
    db.add(target)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Antibody already a target in this panel"
        )
    db.refresh(target)
    return target


@router.delete("/{id}/targets/{target_id}", status_code=204)
def remove_target(
    id: str,
    target_id: str,
    db: Session = Depends(get_db),
):
    target = db.get(PanelTarget, target_id)
    if target is None or target.panel_id != id:
        raise HTTPException(status_code=404, detail="Target not found in this panel")

    # Also delete any assignment for this antibody in this panel
    db.execute(
        PanelAssignment.__table__.delete().where(
            PanelAssignment.panel_id == id,
            PanelAssignment.antibody_id == target.antibody_id,
        )
    )
    db.delete(target)
    db.commit()


@router.post("/{id}/assignments", response_model=PanelAssignmentRead, status_code=201)
def add_assignment(
    id: str,
    data: PanelAssignmentCreate,
    db: Session = Depends(get_db),
):
    panel = _load_panel(db, id)

    if panel.instrument_id is None:
        raise HTTPException(
            status_code=400, detail="Panel has no instrument selected"
        )

    # Validate antibody exists
    antibody = db.get(Antibody, data.antibody_id)
    if antibody is None:
        raise HTTPException(status_code=404, detail="Antibody not found")

    # Validate fluorophore exists
    fluorophore = db.get(Fluorophore, data.fluorophore_id)
    if fluorophore is None:
        raise HTTPException(status_code=404, detail="Fluorophore not found")

    # Validate detector exists
    detector = db.get(Detector, data.detector_id)
    if detector is None:
        raise HTTPException(status_code=404, detail="Detector not found")

    # Validate antibody is a target in this panel
    is_target = db.scalar(
        select(PanelTarget.id).where(
            PanelTarget.panel_id == id,
            PanelTarget.antibody_id == data.antibody_id,
        )
    )
    if is_target is None:
        raise HTTPException(
            status_code=400, detail="Antibody must be added as a target first"
        )

    # Validate detector belongs to the panel's instrument
    instrument = db.get(Instrument, panel.instrument_id)
    stmt = (
        select(Detector.id)
        .join(Laser, Detector.laser_id == Laser.id)
        .where(
            Laser.instrument_id == panel.instrument_id,
            Detector.id == data.detector_id,
        )
    )
    det_belongs = db.scalar(stmt)
    if det_belongs is None:
        raise HTTPException(
            status_code=400,
            detail="Detector does not belong to this panel's instrument",
        )

    # App-level uniqueness checks for user-friendly messages
    existing_ab = db.scalar(
        select(PanelAssignment.id).where(
            PanelAssignment.panel_id == id,
            PanelAssignment.antibody_id == data.antibody_id,
        )
    )
    if existing_ab is not None:
        raise HTTPException(
            status_code=409, detail="Antibody already assigned in this panel"
        )

    existing_det = db.scalar(
        select(PanelAssignment.id).where(
            PanelAssignment.panel_id == id,
            PanelAssignment.detector_id == data.detector_id,
        )
    )
    if existing_det is not None:
        raise HTTPException(
            status_code=409, detail="Detector already assigned in this panel"
        )

    assignment = PanelAssignment(
        panel_id=id,
        antibody_id=data.antibody_id,
        fluorophore_id=data.fluorophore_id,
        detector_id=data.detector_id,
        notes=data.notes,
    )
    db.add(assignment)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Assignment conflict (unique constraint violated)"
        )
    db.refresh(assignment)
    return assignment


@router.delete("/{id}/assignments/{assignment_id}", status_code=204)
def remove_assignment(
    id: str,
    assignment_id: str,
    db: Session = Depends(get_db),
):
    assignment = db.get(PanelAssignment, assignment_id)
    if assignment is None or assignment.panel_id != id:
        raise HTTPException(
            status_code=404, detail="Assignment not found in this panel"
        )
    db.delete(assignment)
    db.commit()
