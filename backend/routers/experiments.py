from __future__ import annotations

import json
import uuid

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm import selectinload

from database import get_db
from models import Detector
from models import Experiment
from models import ExperimentBlock
from models import IFPanel
from models import Instrument
from models import IFPanelAssignment
from models import IFPanelTarget
from models import Laser
from models import Microscope
from models import MicroscopeFilter
from models import MicroscopeLaser
from models import Panel
from models import PanelAssignment
from models import PanelTarget
from models import SecondaryAntibody
from schemas import ExperimentBlockCreate
from schemas import ExperimentBlockRead
from schemas import ExperimentBlockReorder
from schemas import ExperimentBlockUpdate
from schemas import ExperimentCreate
from schemas import ExperimentListRead
from schemas import ExperimentRead
from schemas import ExperimentUpdate
from schemas import PaginatedResponse
from schemas import SnapshotPanelRequest

router = APIRouter()


def _snapshot_instrument(instrument):
    if instrument is None:
        return None
    return {
        "id": instrument.id,
        "name": instrument.name,
        "lasers": [
            {
                "id": laser.id,
                "wavelength_nm": laser.wavelength_nm,
                "name": laser.name,
                "detectors": [
                    {
                        "id": det.id,
                        "filter_midpoint": det.filter_midpoint,
                        "filter_width": det.filter_width,
                        "name": det.name,
                    }
                    for det in laser.detectors
                ],
            }
            for laser in sorted(instrument.lasers, key=lambda l: l.wavelength_nm)
        ],
    }


def _snapshot_microscope(microscope):
    if microscope is None:
        return None
    return {
        "id": microscope.id,
        "name": microscope.name,
        "lasers": [
            {
                "id": laser.id,
                "wavelength_nm": laser.wavelength_nm,
                "name": laser.name,
                "excitation_type": laser.excitation_type,
                "ex_filter_width": laser.ex_filter_width,
                "filters": [
                    {
                        "id": filt.id,
                        "filter_midpoint": filt.filter_midpoint,
                        "filter_width": filt.filter_width,
                        "name": filt.name,
                    }
                    for filt in laser.filters
                ],
            }
            for laser in sorted(microscope.lasers, key=lambda l: l.wavelength_nm)
        ],
    }


def _block_to_read(block: ExperimentBlock) -> dict:
    return {
        "id": block.id,
        "experiment_id": block.experiment_id,
        "block_type": block.block_type,
        "content": json.loads(block.content),
        "sort_order": block.sort_order,
        "parent_id": block.parent_id,
        "created_at": block.created_at,
        "updated_at": block.updated_at,
    }


def _experiment_to_read(exp: Experiment) -> dict:
    return {
        "id": exp.id,
        "name": exp.name,
        "description": exp.description,
        "created_at": exp.created_at,
        "updated_at": exp.updated_at,
        "blocks": [
            _block_to_read(b) for b in sorted(exp.blocks, key=lambda x: x.sort_order)
        ],
    }


def _load_experiment(db: Session, experiment_id: str) -> Experiment:
    stmt = (
        select(Experiment)
        .options(selectinload(Experiment.blocks))
        .where(Experiment.id == experiment_id)
    )
    experiment = db.scalars(stmt).first()
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    return experiment


@router.get("/", response_model=PaginatedResponse[ExperimentListRead])
def list_experiments(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    limit = min(limit, 500)
    stmt = (
        select(Experiment)
        .options(selectinload(Experiment.blocks))
        .order_by(Experiment.created_at.desc())
        .offset(skip)
        .limit(limit)
    )
    experiments = list(db.scalars(stmt).unique())
    total = db.scalar(select(func.count()).select_from(Experiment))
    items = []
    for exp in experiments:
        items.append({
            "id": exp.id,
            "name": exp.name,
            "description": exp.description,
            "created_at": exp.created_at,
            "updated_at": exp.updated_at,
            "block_count": len(exp.blocks),
        })
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("/", response_model=ExperimentRead, status_code=201)
def create_experiment(
    data: ExperimentCreate,
    db: Session = Depends(get_db),
):
    experiment = Experiment(name=data.name, description=data.description)
    db.add(experiment)
    db.commit()
    return _experiment_to_read(_load_experiment(db, experiment.id))


@router.get("/{id}", response_model=ExperimentRead)
def get_experiment(id: str, db: Session = Depends(get_db)):
    return _experiment_to_read(_load_experiment(db, id))


@router.put("/{id}", response_model=ExperimentRead)
def update_experiment(
    id: str,
    data: ExperimentUpdate,
    db: Session = Depends(get_db),
):
    experiment = _load_experiment(db, id)
    if data.name is not None:
        experiment.name = data.name
    if data.description is not None:
        experiment.description = data.description
    db.commit()
    return _experiment_to_read(_load_experiment(db, id))


@router.delete("/{id}", status_code=204)
def delete_experiment(id: str, db: Session = Depends(get_db)):
    experiment = db.get(Experiment, id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")
    db.delete(experiment)
    db.commit()


# --- Block endpoints ---

@router.post("/{id}/blocks", response_model=ExperimentBlockRead, status_code=201)
def create_block(
    id: str,
    data: ExperimentBlockCreate,
    db: Session = Depends(get_db),
):
    experiment = db.get(Experiment, id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")

    if data.parent_id is not None:
        parent = db.get(ExperimentBlock, data.parent_id)
        if parent is None or parent.experiment_id != id:
            raise HTTPException(
                status_code=400,
                detail="Parent block not found in this experiment",
            )

    block = ExperimentBlock(
        experiment_id=id,
        block_type=data.block_type,
        content=json.dumps(data.content),
        sort_order=data.sort_order,
        parent_id=data.parent_id,
    )
    db.add(block)
    db.commit()
    db.refresh(block)
    return _block_to_read(block)


# IMPORTANT: reorder route MUST be declared before /{block_id} to avoid
# "reorder" being matched as a block_id path parameter.
@router.put("/{id}/blocks/reorder", response_model=ExperimentRead)
def reorder_blocks(
    id: str,
    data: ExperimentBlockReorder,
    db: Session = Depends(get_db),
):
    experiment = db.get(Experiment, id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")

    # Validate all provided block IDs belong to this experiment
    for item in data.blocks:
        block = db.get(ExperimentBlock, item.id)
        if block is None or block.experiment_id != id:
            raise HTTPException(
                status_code=400,
                detail="Block %s does not belong to this experiment" % item.id,
            )

    # Apply reorder updates
    for item in data.blocks:
        block = db.get(ExperimentBlock, item.id)
        block.sort_order = item.sort_order
        block.parent_id = item.parent_id

    db.commit()
    return _experiment_to_read(_load_experiment(db, id))


@router.put("/{id}/blocks/{block_id}", response_model=ExperimentBlockRead)
def update_block(
    id: str,
    block_id: str,
    data: ExperimentBlockUpdate,
    db: Session = Depends(get_db),
):
    block = db.get(ExperimentBlock, block_id)
    if block is None or block.experiment_id != id:
        raise HTTPException(status_code=404, detail="Block not found in this experiment")

    if data.block_type is not None:
        block.block_type = data.block_type
    if data.content is not None:
        block.content = json.dumps(data.content)
    if data.sort_order is not None:
        block.sort_order = data.sort_order
    if data.parent_id is not None:
        block.parent_id = data.parent_id

    db.commit()
    db.refresh(block)
    return _block_to_read(block)


@router.delete("/{id}/blocks/{block_id}", status_code=204)
def delete_block(
    id: str,
    block_id: str,
    db: Session = Depends(get_db),
):
    block = db.get(ExperimentBlock, block_id)
    if block is None or block.experiment_id != id:
        raise HTTPException(status_code=404, detail="Block not found in this experiment")
    db.delete(block)
    db.commit()


@router.post("/{id}/snapshot-panel", response_model=ExperimentBlockRead, status_code=201)
def snapshot_panel(
    id: str,
    data: SnapshotPanelRequest,
    db: Session = Depends(get_db),
):
    experiment = db.get(Experiment, id)
    if experiment is None:
        raise HTTPException(status_code=404, detail="Experiment not found")

    if data.panel_type not in ("flow", "if"):
        raise HTTPException(status_code=400, detail="panel_type must be 'flow' or 'if'")

    # Compute sort_order: place after the last existing block
    max_sort = db.scalar(
        select(func.coalesce(func.max(ExperimentBlock.sort_order), -1.0)).where(
            ExperimentBlock.experiment_id == id
        )
    )
    sort_order = max_sort + 1.0

    if data.panel_type == "flow":
        stmt = (
            select(Panel)
            .options(
                selectinload(Panel.targets).selectinload(PanelTarget.antibody),
                selectinload(Panel.targets)
                .selectinload(PanelTarget.secondary_antibody)
                .selectinload(SecondaryAntibody.fluorophore),
                selectinload(Panel.assignments).selectinload(PanelAssignment.fluorophore),
                selectinload(Panel.assignments).selectinload(PanelAssignment.detector),
                selectinload(Panel.instrument)
                .selectinload(Instrument.lasers)
                .selectinload(Laser.detectors),
            )
            .where(Panel.id == data.source_panel_id)
        )
        panel = db.scalars(stmt).first()
        if panel is None:
            raise HTTPException(status_code=404, detail="Panel not found")

        content = {
            "source_panel_id": panel.id,
            "name": panel.name,
            "instrument": _snapshot_instrument(panel.instrument),
            "targets": [
                {
                    "id": str(uuid.uuid4()),
                    "antibody_id": t.antibody_id,
                    "antibody_name": t.antibody.name if t.antibody else None,
                    "antibody_target": t.antibody.target if t.antibody else None,
                    "antibody_host": t.antibody.host if t.antibody else None,
                    "antibody_clone": t.antibody.clone if t.antibody else None,
                    "staining_mode": t.staining_mode,
                    "secondary_antibody_id": t.secondary_antibody_id,
                    "secondary_antibody_name": (
                        t.secondary_antibody.name if t.secondary_antibody else None
                    ),
                    "sort_order": t.sort_order,
                    "flow_dilution_factor": (
                        t.antibody.flow_dilution_factor if t.antibody else None
                    ),
                    "icc_if_dilution_factor": (
                        t.antibody.icc_if_dilution_factor if t.antibody else None
                    ),
                }
                for t in sorted(panel.targets, key=lambda x: x.sort_order)
            ],
            "assignments": [
                {
                    "id": str(uuid.uuid4()),
                    "antibody_id": a.antibody_id,
                    "fluorophore_id": a.fluorophore_id,
                    "fluorophore_name": a.fluorophore.name if a.fluorophore else None,
                    "detector_id": a.detector_id,
                    "detector_name": a.detector.name if a.detector else None,
                }
                for a in panel.assignments
            ],
            "volume_params": {
                "num_samples": 1,
                "volume_per_sample_ul": 100,
                "pipet_error_factor": 1.1,
                "dilution_source": "flow",
            },
        }
        block_type = "flow_panel"

    else:  # "if"
        stmt = (
            select(IFPanel)
            .options(
                selectinload(IFPanel.targets).selectinload(IFPanelTarget.antibody),
                selectinload(IFPanel.targets)
                .selectinload(IFPanelTarget.secondary_antibody)
                .selectinload(SecondaryAntibody.fluorophore),
                selectinload(IFPanel.assignments).selectinload(IFPanelAssignment.fluorophore),
                selectinload(IFPanel.assignments).selectinload(IFPanelAssignment.filter),
                selectinload(IFPanel.microscope)
                .selectinload(Microscope.lasers)
                .selectinload(MicroscopeLaser.filters),
            )
            .where(IFPanel.id == data.source_panel_id)
        )
        if_panel = db.scalars(stmt).first()
        if if_panel is None:
            raise HTTPException(status_code=404, detail="IF panel not found")

        content = {
            "source_panel_id": if_panel.id,
            "name": if_panel.name,
            "panel_type": if_panel.panel_type,
            "microscope": _snapshot_microscope(if_panel.microscope),
            "view_mode": if_panel.view_mode,
            "targets": [
                {
                    "id": str(uuid.uuid4()),
                    "antibody_id": t.antibody_id,
                    "antibody_name": t.antibody.name if t.antibody else None,
                    "antibody_target": t.antibody.target if t.antibody else None,
                    "antibody_host": t.antibody.host if t.antibody else None,
                    "staining_mode": t.staining_mode,
                    "secondary_antibody_id": t.secondary_antibody_id,
                    "secondary_antibody_name": (
                        t.secondary_antibody.name if t.secondary_antibody else None
                    ),
                    "secondary_fluorophore_id": (
                        t.secondary_antibody.fluorophore_id
                        if t.secondary_antibody else None
                    ),
                    "secondary_fluorophore_name": (
                        t.secondary_antibody.fluorophore.name
                        if t.secondary_antibody and t.secondary_antibody.fluorophore else None
                    ),
                    "sort_order": t.sort_order,
                    "dilution_override": t.dilution_override,
                    "icc_if_dilution_factor": (
                        t.antibody.icc_if_dilution_factor if t.antibody else None
                    ),
                }
                for t in sorted(if_panel.targets, key=lambda x: x.sort_order)
            ],
            "assignments": [
                {
                    "id": str(uuid.uuid4()),
                    "antibody_id": a.antibody_id,
                    "fluorophore_id": a.fluorophore_id,
                    "fluorophore_name": a.fluorophore.name if a.fluorophore else None,
                    "filter_id": a.filter_id,
                    "filter_name": a.filter.name if a.filter else None,
                }
                for a in if_panel.assignments
            ],
            "volume_params": {
                "num_samples": 1,
                "volume_per_sample_ul": 200,
                "pipet_error_factor": 1.1,
                "dilution_source": "icc_if",
            },
        }
        block_type = "if_panel"

    block = ExperimentBlock(
        experiment_id=id,
        block_type=block_type,
        content=json.dumps(content),
        sort_order=sort_order,
    )
    db.add(block)
    db.commit()
    db.refresh(block)
    return _block_to_read(block)
