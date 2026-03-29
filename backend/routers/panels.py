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
from models import SecondaryAntibody
from schemas import PaginatedResponse
from schemas import PanelAssignmentCreate
from schemas import PanelAssignmentRead
from schemas import PanelCreate
from schemas import PanelListRead
from schemas import PanelRead
from schemas import PanelTargetCreate
from schemas import PanelTargetRead
from schemas import PanelTargetReorder
from schemas import PanelTargetUpdate
from schemas import PanelUpdate

router = APIRouter()


def _target_to_read(t: PanelTarget) -> dict:
    ab = t.antibody
    sa = t.secondary_antibody
    return {
        "id": t.id,
        "panel_id": t.panel_id,
        "antibody_id": t.antibody_id,
        "staining_mode": t.staining_mode,
        "secondary_antibody_id": t.secondary_antibody_id,
        "sort_order": t.sort_order,
        "antibody_name": ab.name if ab else None,
        "antibody_target": ab.target if ab else None,
        "secondary_antibody_name": sa.name if sa else None,
        "secondary_fluorophore_id": sa.fluorophore_id if sa else None,
        "secondary_fluorophore_name": (
            sa.fluorophore.name if sa and sa.fluorophore else None
        ),
    }


def _load_panel(db: Session, panel_id: str) -> Panel:
    stmt = (
        select(Panel)
        .options(
            selectinload(Panel.targets)
            .selectinload(PanelTarget.antibody),
            selectinload(Panel.targets)
            .selectinload(PanelTarget.secondary_antibody)
            .selectinload(SecondaryAntibody.fluorophore),
            selectinload(Panel.assignments),
        )
        .where(Panel.id == panel_id)
    )
    panel = db.scalars(stmt).first()
    if panel is None:
        raise HTTPException(status_code=404, detail="Panel not found")
    return panel


def _panel_to_read(panel: Panel) -> dict:
    return {
        "id": panel.id,
        "name": panel.name,
        "instrument_id": panel.instrument_id,
        "created_at": panel.created_at,
        "updated_at": panel.updated_at,
        "targets": [_target_to_read(t) for t in sorted(panel.targets, key=lambda x: x.sort_order)],
        "assignments": [
            {
                "id": a.id,
                "panel_id": a.panel_id,
                "antibody_id": a.antibody_id,
                "fluorophore_id": a.fluorophore_id,
                "detector_id": a.detector_id,
                "notes": a.notes,
            }
            for a in panel.assignments
        ],
    }


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
    return _panel_to_read(_load_panel(db, panel.id))


@router.get("/{id}", response_model=PanelRead)
def get_panel(id: str, db: Session = Depends(get_db)):
    return _panel_to_read(_load_panel(db, id))


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
    return _panel_to_read(_load_panel(db, panel.id))


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

    if data.staining_mode not in ("direct", "indirect"):
        raise HTTPException(status_code=400, detail="staining_mode must be 'direct' or 'indirect'")

    if data.antibody_id is not None:
        antibody = db.get(Antibody, data.antibody_id)
        if antibody is None:
            raise HTTPException(status_code=404, detail="Antibody not found")

        # Check uniqueness (only when antibody_id is not null)
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

    if data.staining_mode == "indirect" and data.secondary_antibody_id is not None:
        sa = db.get(SecondaryAntibody, data.secondary_antibody_id)
        if sa is None:
            raise HTTPException(status_code=404, detail="Secondary antibody not found")
    elif data.staining_mode == "direct":
        data.secondary_antibody_id = None

    # Auto-assign sort_order
    max_order = db.scalar(
        select(func.coalesce(func.max(PanelTarget.sort_order), -1)).where(
            PanelTarget.panel_id == id
        )
    )

    target = PanelTarget(
        panel_id=id,
        antibody_id=data.antibody_id,
        staining_mode=data.staining_mode,
        secondary_antibody_id=data.secondary_antibody_id,
        sort_order=max_order + 1,
    )
    db.add(target)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Antibody already a target in this panel"
        )
    db.refresh(target)
    # Eager-load relationships for response
    if target.antibody_id:
        _ = target.antibody
    if target.secondary_antibody_id:
        sa = target.secondary_antibody
        if sa and sa.fluorophore_id:
            _ = sa.fluorophore
    return _target_to_read(target)


@router.put("/{id}/targets/reorder", response_model=list[PanelTargetRead])
def reorder_targets(
    id: str,
    data: PanelTargetReorder,
    db: Session = Depends(get_db),
):
    panel = db.get(Panel, id)
    if panel is None:
        raise HTTPException(status_code=404, detail="Panel not found")

    # Load all targets for this panel
    targets = list(
        db.scalars(select(PanelTarget).where(PanelTarget.panel_id == id))
    )
    target_map = {t.id: t for t in targets}

    # Validate: no missing/extra IDs
    existing_ids = set(target_map.keys())
    provided_ids = set(data.target_ids)
    if existing_ids != provided_ids:
        raise HTTPException(
            status_code=400,
            detail="target_ids must contain exactly all target IDs for this panel",
        )

    for idx, tid in enumerate(data.target_ids):
        target_map[tid].sort_order = idx

    db.commit()

    # Reload with relationships for response
    loaded_panel = _load_panel(db, id)
    return [_target_to_read(t) for t in sorted(loaded_panel.targets, key=lambda x: x.sort_order)]


@router.put("/{id}/targets/{target_id}", response_model=PanelTargetRead)
def update_target(
    id: str,
    target_id: str,
    data: PanelTargetUpdate,
    db: Session = Depends(get_db),
):
    target = db.get(PanelTarget, target_id)
    if target is None or target.panel_id != id:
        raise HTTPException(status_code=404, detail="Target not found in this panel")

    if data.staining_mode is not None:
        if data.staining_mode not in ("direct", "indirect"):
            raise HTTPException(status_code=400, detail="staining_mode must be 'direct' or 'indirect'")
        target.staining_mode = data.staining_mode

    # Handle antibody_id change
    if data.antibody_id is not None and data.antibody_id != target.antibody_id:
        antibody = db.get(Antibody, data.antibody_id)
        if antibody is None:
            raise HTTPException(status_code=404, detail="Antibody not found")
        # Check uniqueness
        existing = db.scalar(
            select(PanelTarget.id).where(
                PanelTarget.panel_id == id,
                PanelTarget.antibody_id == data.antibody_id,
                PanelTarget.id != target_id,
            )
        )
        if existing is not None:
            raise HTTPException(
                status_code=409, detail="Antibody already a target in this panel"
            )
        # Re-point any existing PanelAssignment from old antibody to new
        old_ab_id = target.antibody_id
        if old_ab_id is not None:
            db.execute(
                PanelAssignment.__table__.update()
                .where(
                    PanelAssignment.panel_id == id,
                    PanelAssignment.antibody_id == old_ab_id,
                )
                .values(antibody_id=data.antibody_id)
            )
        target.antibody_id = data.antibody_id
    elif "antibody_id" in (data.model_fields_set or set()) and data.antibody_id is None:
        # Explicitly setting antibody_id to null
        if target.antibody_id is not None:
            db.execute(
                PanelAssignment.__table__.delete().where(
                    PanelAssignment.panel_id == id,
                    PanelAssignment.antibody_id == target.antibody_id,
                )
            )
        target.antibody_id = None

    # Handle secondary antibody
    if target.staining_mode == "indirect":
        if data.secondary_antibody_id is not None:
            sa = db.get(SecondaryAntibody, data.secondary_antibody_id)
            if sa is None:
                raise HTTPException(status_code=404, detail="Secondary antibody not found")
            target.secondary_antibody_id = data.secondary_antibody_id
    else:
        target.secondary_antibody_id = None

    db.commit()
    db.refresh(target)
    # Eager-load relationships
    if target.antibody_id:
        _ = target.antibody
    if target.secondary_antibody_id:
        sa = target.secondary_antibody
        if sa and sa.fluorophore_id:
            _ = sa.fluorophore
    return _target_to_read(target)


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
    if target.antibody_id is not None:
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
