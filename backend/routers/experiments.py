from __future__ import annotations

import json

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm import selectinload

from database import get_db
from models import Experiment
from models import ExperimentBlock
from services.panel_snapshot import build_flow_panel_snapshot
from services.panel_snapshot import build_if_panel_snapshot
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
        "is_full_width": exp.is_full_width,
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
            "is_full_width": exp.is_full_width,
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
    experiment = Experiment(
        name=data.name,
        description=data.description,
        is_full_width=data.is_full_width,
    )
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
    fields_set = data.model_fields_set
    if "name" in fields_set and data.name is not None:
        experiment.name = data.name
    if "description" in fields_set:
        experiment.description = data.description
    if "is_full_width" in fields_set and data.is_full_width is not None:
        experiment.is_full_width = data.is_full_width
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

    # Batch-fetch all blocks in one query
    block_ids = [item.id for item in data.blocks]
    blocks = list(
        db.scalars(
            select(ExperimentBlock).where(ExperimentBlock.id.in_(block_ids))
        )
    )
    block_map = {b.id: b for b in blocks}

    # Validate all provided block IDs belong to this experiment
    for item in data.blocks:
        block = block_map.get(item.id)
        if block is None or block.experiment_id != id:
            raise HTTPException(
                status_code=400,
                detail="Block %s does not belong to this experiment" % item.id,
            )

    # Apply reorder updates
    for item in data.blocks:
        block = block_map[item.id]
        block.sort_order = item.sort_order
        if "parent_id" in item.model_fields_set:
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

    fields_set = data.model_fields_set
    if "block_type" in fields_set and data.block_type is not None:
        block.block_type = data.block_type
    if "content" in fields_set and data.content is not None:
        block.content = json.dumps(data.content)
    if "sort_order" in fields_set and data.sort_order is not None:
        block.sort_order = data.sort_order
    if "parent_id" in fields_set:
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
        snapshot = build_flow_panel_snapshot(data.source_panel_id, db)
    else:  # "if"
        snapshot = build_if_panel_snapshot(data.source_panel_id, db)

    block = ExperimentBlock(
        experiment_id=id,
        block_type=snapshot["type"],
        content=json.dumps(snapshot["attrs"]),
        sort_order=sort_order,
    )
    db.add(block)
    db.commit()
    db.refresh(block)
    return _block_to_read(block)
