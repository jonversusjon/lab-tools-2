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
from models import DyeLabel
from models import Fluorophore
from models import IFPanel
from models import IFPanelAssignment
from models import IFPanelTarget
from models import Microscope
from models import MicroscopeFilter
from models import MicroscopeLaser
from models import SecondaryAntibody
from schemas import IFPanelAssignmentCreate
from schemas import IFPanelAssignmentRead
from schemas import IFPanelCreate
from schemas import IFPanelListRead
from schemas import IFPanelRead
from schemas import IFPanelTargetCreate
from schemas import IFPanelTargetRead
from schemas import IFPanelTargetReorder
from schemas import IFPanelTargetUpdate
from schemas import IFPanelUpdate
from schemas import PaginatedResponse

router = APIRouter()


def _target_to_read(t: IFPanelTarget) -> dict:
    ab = t.antibody
    sa = t.secondary_antibody
    dl = t.dye_label
    return {
        "id": t.id,
        "panel_id": t.panel_id,
        "antibody_id": t.antibody_id,
        "dye_label_id": t.dye_label_id,
        "dye_label_name": dl.name if dl else None,
        "dye_label_target": dl.label_target if dl else None,
        "dye_label_fluorophore_id": dl.fluorophore_id if dl else None,
        "dye_label_fluorophore_name": (
            dl.fluorophore.name if dl and dl.fluorophore else None
        ),
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
        "dilution_override": t.dilution_override,
        "antibody_icc_if_dilution": ab.icc_if_dilution if ab else None,
    }


def _load_if_panel(db: Session, panel_id: str) -> IFPanel:
    stmt = (
        select(IFPanel)
        .options(
            selectinload(IFPanel.targets)
            .selectinload(IFPanelTarget.antibody),
            selectinload(IFPanel.targets)
            .selectinload(IFPanelTarget.secondary_antibody)
            .selectinload(SecondaryAntibody.fluorophore),
            selectinload(IFPanel.targets)
            .selectinload(IFPanelTarget.dye_label)
            .selectinload(DyeLabel.fluorophore),
            selectinload(IFPanel.assignments),
        )
        .where(IFPanel.id == panel_id)
    )
    panel = db.scalars(stmt).first()
    if panel is None:
        raise HTTPException(status_code=404, detail="IF panel not found")
    return panel


def _panel_to_read(panel: IFPanel) -> dict:
    return {
        "id": panel.id,
        "name": panel.name,
        "panel_type": panel.panel_type,
        "microscope_id": panel.microscope_id,
        "view_mode": panel.view_mode,
        "created_at": panel.created_at,
        "updated_at": panel.updated_at,
        "targets": [_target_to_read(t) for t in sorted(panel.targets, key=lambda x: x.sort_order)],
        "assignments": [
            {
                "id": a.id,
                "panel_id": a.panel_id,
                "antibody_id": a.antibody_id,
                "dye_label_id": a.dye_label_id,
                "fluorophore_id": a.fluorophore_id,
                "filter_id": a.filter_id,
                "notes": a.notes,
            }
            for a in panel.assignments
        ],
    }


@router.get("/", response_model=PaginatedResponse[IFPanelListRead])
def list_if_panels(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    limit = min(limit, 500)
    stmt = (
        select(IFPanel)
        .options(
            selectinload(IFPanel.targets),
            selectinload(IFPanel.assignments),
        )
        .offset(skip)
        .limit(limit)
    )
    panels = list(db.scalars(stmt).unique())
    total = db.scalar(select(func.count()).select_from(IFPanel))
    items = []
    for p in panels:
        items.append({
            "id": p.id,
            "name": p.name,
            "panel_type": p.panel_type,
            "microscope_id": p.microscope_id,
            "view_mode": p.view_mode,
            "created_at": p.created_at,
            "updated_at": p.updated_at,
            "target_count": len(p.targets),
            "assignment_count": len(p.assignments),
        })
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("/", response_model=IFPanelRead, status_code=201)
def create_if_panel(
    data: IFPanelCreate,
    db: Session = Depends(get_db),
):
    if data.microscope_id is not None:
        microscope = db.get(Microscope, data.microscope_id)
        if microscope is None:
            raise HTTPException(status_code=404, detail="Microscope not found")

    panel = IFPanel(
        name=data.name,
        panel_type=data.panel_type,
        microscope_id=data.microscope_id,
        view_mode=data.view_mode,
    )
    db.add(panel)
    db.commit()
    return _panel_to_read(_load_if_panel(db, panel.id))


@router.get("/{id}", response_model=IFPanelRead)
def get_if_panel(id: str, db: Session = Depends(get_db)):
    return _panel_to_read(_load_if_panel(db, id))


@router.put("/{id}", response_model=IFPanelRead)
def update_if_panel(
    id: str,
    data: IFPanelUpdate,
    db: Session = Depends(get_db),
):
    panel = _load_if_panel(db, id)

    # Validate microscope if provided
    if data.microscope_id is not None:
        microscope = db.get(Microscope, data.microscope_id)
        if microscope is None:
            raise HTTPException(status_code=404, detail="Microscope not found")

    # If microscope_id changes, clear filter-linked assignments only
    microscope_changed = (
        data.microscope_id is not None
        and panel.microscope_id != data.microscope_id
    )
    if microscope_changed:
        db.execute(
            IFPanelAssignment.__table__.delete().where(
                IFPanelAssignment.panel_id == panel.id,
                IFPanelAssignment.filter_id.is_not(None),
            )
        )

    # Update only provided fields
    if data.name is not None:
        panel.name = data.name
    if data.panel_type is not None:
        panel.panel_type = data.panel_type
    if data.microscope_id is not None:
        panel.microscope_id = data.microscope_id
    elif "microscope_id" in (data.model_fields_set or set()):
        # Explicitly unsetting microscope — clear filter-linked assignments
        db.execute(
            IFPanelAssignment.__table__.delete().where(
                IFPanelAssignment.panel_id == panel.id,
                IFPanelAssignment.filter_id.is_not(None),
            )
        )
        panel.microscope_id = None
    if data.view_mode is not None:
        panel.view_mode = data.view_mode

    db.commit()
    return _panel_to_read(_load_if_panel(db, panel.id))


@router.delete("/{id}", status_code=204)
def delete_if_panel(id: str, db: Session = Depends(get_db)):
    panel = db.get(IFPanel, id)
    if panel is None:
        raise HTTPException(status_code=404, detail="IF panel not found")
    db.delete(panel)
    db.commit()


@router.post("/{id}/targets", response_model=IFPanelTargetRead, status_code=201)
def add_target(
    id: str,
    data: IFPanelTargetCreate,
    db: Session = Depends(get_db),
):
    panel = db.get(IFPanel, id)
    if panel is None:
        raise HTTPException(status_code=404, detail="IF panel not found")

    has_antibody = data.antibody_id is not None
    has_dye_label = data.dye_label_id is not None

    if has_antibody and has_dye_label:
        raise HTTPException(
            status_code=400,
            detail="Target must be either an antibody or a dye/label, not both",
        )

    if has_dye_label:
        dl = db.get(DyeLabel, data.dye_label_id)
        if dl is None:
            raise HTTPException(status_code=404, detail="Dye/label not found")
        # Dye/label targets are always direct staining
        data.staining_mode = "direct"
        data.secondary_antibody_id = None
        # Check uniqueness
        existing_dl = db.scalar(
            select(IFPanelTarget.id).where(
                IFPanelTarget.panel_id == id,
                IFPanelTarget.dye_label_id == data.dye_label_id,
            )
        )
        if existing_dl is not None:
            raise HTTPException(
                status_code=409, detail="Dye/label already a target in this panel"
            )
    elif has_antibody:
        if data.staining_mode not in ("direct", "indirect"):
            raise HTTPException(status_code=400, detail="staining_mode must be 'direct' or 'indirect'")

        antibody = db.get(Antibody, data.antibody_id)
        if antibody is None:
            raise HTTPException(status_code=404, detail="Antibody not found")

        existing = db.scalar(
            select(IFPanelTarget.id).where(
                IFPanelTarget.panel_id == id,
                IFPanelTarget.antibody_id == data.antibody_id,
            )
        )
        if existing is not None:
            raise HTTPException(
                status_code=409, detail="Antibody already a target in this panel"
            )
    else:
        if data.staining_mode not in ("direct", "indirect"):
            raise HTTPException(status_code=400, detail="staining_mode must be 'direct' or 'indirect'")

    if not has_dye_label:
        if data.staining_mode == "indirect" and data.secondary_antibody_id is not None:
            sa = db.get(SecondaryAntibody, data.secondary_antibody_id)
            if sa is None:
                raise HTTPException(status_code=404, detail="Secondary antibody not found")
        elif data.staining_mode == "direct":
            data.secondary_antibody_id = None

    # Auto-assign sort_order
    max_order = db.scalar(
        select(func.coalesce(func.max(IFPanelTarget.sort_order), -1)).where(
            IFPanelTarget.panel_id == id
        )
    )

    target = IFPanelTarget(
        panel_id=id,
        antibody_id=data.antibody_id,
        dye_label_id=data.dye_label_id,
        staining_mode=data.staining_mode,
        secondary_antibody_id=data.secondary_antibody_id,
        sort_order=max_order + 1,
        dilution_override=data.dilution_override,
    )
    db.add(target)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(
            status_code=409, detail="Target already exists in this panel"
        )
    db.refresh(target)
    # Eager-load relationships for response
    if target.antibody_id:
        _ = target.antibody
    if target.dye_label_id:
        dl = target.dye_label
        if dl and dl.fluorophore_id:
            _ = dl.fluorophore
    if target.secondary_antibody_id:
        sa = target.secondary_antibody
        if sa and sa.fluorophore_id:
            _ = sa.fluorophore
    return _target_to_read(target)


@router.put("/{id}/targets/reorder", response_model=list[IFPanelTargetRead])
def reorder_targets(
    id: str,
    data: IFPanelTargetReorder,
    db: Session = Depends(get_db),
):
    panel = db.get(IFPanel, id)
    if panel is None:
        raise HTTPException(status_code=404, detail="IF panel not found")

    # Load all targets for this panel
    targets = list(
        db.scalars(select(IFPanelTarget).where(IFPanelTarget.panel_id == id))
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
    loaded_panel = _load_if_panel(db, id)
    return [_target_to_read(t) for t in sorted(loaded_panel.targets, key=lambda x: x.sort_order)]


@router.put("/{id}/targets/{target_id}", response_model=IFPanelTargetRead)
def update_target(
    id: str,
    target_id: str,
    data: IFPanelTargetUpdate,
    db: Session = Depends(get_db),
):
    target = db.get(IFPanelTarget, target_id)
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
            select(IFPanelTarget.id).where(
                IFPanelTarget.panel_id == id,
                IFPanelTarget.antibody_id == data.antibody_id,
                IFPanelTarget.id != target_id,
            )
        )
        if existing is not None:
            raise HTTPException(
                status_code=409, detail="Antibody already a target in this panel"
            )
        # Delete any existing assignment for the old antibody
        old_ab_id = target.antibody_id
        if old_ab_id is not None:
            db.execute(
                IFPanelAssignment.__table__.delete().where(
                    IFPanelAssignment.panel_id == id,
                    IFPanelAssignment.antibody_id == old_ab_id,
                )
            )
        target.antibody_id = data.antibody_id
    elif "antibody_id" in (data.model_fields_set or set()) and data.antibody_id is None:
        # Explicitly setting antibody_id to null
        if target.antibody_id is not None:
            db.execute(
                IFPanelAssignment.__table__.delete().where(
                    IFPanelAssignment.panel_id == id,
                    IFPanelAssignment.antibody_id == target.antibody_id,
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

    # Handle dilution_override
    if data.dilution_override is not None:
        target.dilution_override = data.dilution_override
    elif "dilution_override" in (data.model_fields_set or set()):
        target.dilution_override = None

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
    target = db.get(IFPanelTarget, target_id)
    if target is None or target.panel_id != id:
        raise HTTPException(status_code=404, detail="Target not found in this panel")

    # Also delete any assignment for this antibody in this panel
    if target.antibody_id is not None:
        db.execute(
            IFPanelAssignment.__table__.delete().where(
                IFPanelAssignment.panel_id == id,
                IFPanelAssignment.antibody_id == target.antibody_id,
            )
        )
    # Also delete any assignment for this dye_label in this panel
    if target.dye_label_id is not None:
        db.execute(
            IFPanelAssignment.__table__.delete().where(
                IFPanelAssignment.panel_id == id,
                IFPanelAssignment.dye_label_id == target.dye_label_id,
            )
        )
    db.delete(target)
    db.commit()


@router.post("/{id}/assignments", response_model=IFPanelAssignmentRead, status_code=201)
def add_assignment(
    id: str,
    data: IFPanelAssignmentCreate,
    db: Session = Depends(get_db),
):
    panel = _load_if_panel(db, id)

    has_antibody = data.antibody_id is not None
    has_dye_label = data.dye_label_id is not None

    if has_antibody and has_dye_label:
        raise HTTPException(
            status_code=400,
            detail="Assignment must be for an antibody or a dye/label, not both",
        )
    if not has_antibody and not has_dye_label:
        raise HTTPException(
            status_code=400,
            detail="Assignment requires either antibody_id or dye_label_id",
        )

    # Validate fluorophore exists
    fluorophore = db.get(Fluorophore, data.fluorophore_id)
    if fluorophore is None:
        raise HTTPException(status_code=404, detail="Fluorophore not found")

    if has_antibody:
        antibody = db.get(Antibody, data.antibody_id)
        if antibody is None:
            raise HTTPException(status_code=404, detail="Antibody not found")

        is_target = db.scalar(
            select(IFPanelTarget.id).where(
                IFPanelTarget.panel_id == id,
                IFPanelTarget.antibody_id == data.antibody_id,
            )
        )
        if is_target is None:
            raise HTTPException(
                status_code=400, detail="Antibody must be added as a target first"
            )

        existing_ab = db.scalar(
            select(IFPanelAssignment.id).where(
                IFPanelAssignment.panel_id == id,
                IFPanelAssignment.antibody_id == data.antibody_id,
            )
        )
        if existing_ab is not None:
            raise HTTPException(
                status_code=409, detail="Antibody already assigned in this panel"
            )
    else:
        dl = db.get(DyeLabel, data.dye_label_id)
        if dl is None:
            raise HTTPException(status_code=404, detail="Dye/label not found")

        is_target = db.scalar(
            select(IFPanelTarget.id).where(
                IFPanelTarget.panel_id == id,
                IFPanelTarget.dye_label_id == data.dye_label_id,
            )
        )
        if is_target is None:
            raise HTTPException(
                status_code=400, detail="Dye/label must be added as a target first"
            )

        existing_dl = db.scalar(
            select(IFPanelAssignment.id).where(
                IFPanelAssignment.panel_id == id,
                IFPanelAssignment.dye_label_id == data.dye_label_id,
            )
        )
        if existing_dl is not None:
            raise HTTPException(
                status_code=409, detail="Dye/label already assigned in this panel"
            )

    # If filter_id provided, validate it
    if data.filter_id is not None:
        if panel.microscope_id is None:
            raise HTTPException(
                status_code=400, detail="Cannot assign filter: panel has no microscope"
            )

        stmt = (
            select(MicroscopeFilter.id)
            .join(MicroscopeLaser, MicroscopeFilter.laser_id == MicroscopeLaser.id)
            .where(
                MicroscopeLaser.microscope_id == panel.microscope_id,
                MicroscopeFilter.id == data.filter_id,
            )
        )
        if db.scalar(stmt) is None:
            raise HTTPException(
                status_code=400,
                detail="Filter does not belong to this panel's microscope",
            )

        existing_filter = db.scalar(
            select(IFPanelAssignment.id).where(
                IFPanelAssignment.panel_id == id,
                IFPanelAssignment.filter_id == data.filter_id,
            )
        )
        if existing_filter is not None:
            raise HTTPException(
                status_code=409, detail="Filter already assigned in this panel"
            )

    assignment = IFPanelAssignment(
        panel_id=id,
        antibody_id=data.antibody_id,
        dye_label_id=data.dye_label_id,
        fluorophore_id=data.fluorophore_id,
        filter_id=data.filter_id,
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
    return {
        "id": assignment.id,
        "panel_id": assignment.panel_id,
        "antibody_id": assignment.antibody_id,
        "dye_label_id": assignment.dye_label_id,
        "fluorophore_id": assignment.fluorophore_id,
        "filter_id": assignment.filter_id,
        "notes": assignment.notes,
    }


@router.delete("/{id}/assignments/{assignment_id}", status_code=204)
def remove_assignment(
    id: str,
    assignment_id: str,
    db: Session = Depends(get_db),
):
    assignment = db.get(IFPanelAssignment, assignment_id)
    if assignment is None or assignment.panel_id != id:
        raise HTTPException(
            status_code=404, detail="Assignment not found in this panel"
        )
    db.delete(assignment)
    db.commit()
