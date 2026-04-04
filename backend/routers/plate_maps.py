from __future__ import annotations

import json

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import PlateMap
from schemas import PaginatedResponse
from schemas import PlateMapCreate
from schemas import PlateMapListRead
from schemas import PlateMapRead
from schemas import PlateMapUpdate

router = APIRouter()


def _to_read(pm: PlateMap) -> dict:
    return {
        "id": pm.id,
        "name": pm.name,
        "description": pm.description,
        "plate_type": pm.plate_type,
        "well_data": json.loads(pm.well_data),
        "legend": json.loads(pm.legend),
        "created_at": pm.created_at,
        "updated_at": pm.updated_at,
    }


@router.get("/", response_model=PaginatedResponse[PlateMapListRead])
def list_plate_maps(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    limit = min(limit, 500)
    stmt = select(PlateMap)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    results = list(db.scalars(stmt.offset(skip).limit(limit)))
    items = [
        {
            "id": pm.id,
            "name": pm.name,
            "description": pm.description,
            "plate_type": pm.plate_type,
            "created_at": pm.created_at,
            "updated_at": pm.updated_at,
        }
        for pm in results
    ]
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("/", response_model=PlateMapRead, status_code=201)
def create_plate_map(
    data: PlateMapCreate,
    db: Session = Depends(get_db),
):
    pm = PlateMap(
        name=data.name,
        description=data.description,
        plate_type=data.plate_type,
        well_data=json.dumps(data.well_data),
        legend=json.dumps(data.legend),
    )
    db.add(pm)
    db.commit()
    db.refresh(pm)
    return _to_read(pm)


@router.get("/{id}", response_model=PlateMapRead)
def get_plate_map(id: str, db: Session = Depends(get_db)):
    pm = db.get(PlateMap, id)
    if pm is None:
        raise HTTPException(status_code=404, detail="Plate map not found")
    return _to_read(pm)


@router.put("/{id}", response_model=PlateMapRead)
def update_plate_map(
    id: str,
    data: PlateMapUpdate,
    db: Session = Depends(get_db),
):
    pm = db.get(PlateMap, id)
    if pm is None:
        raise HTTPException(status_code=404, detail="Plate map not found")

    if data.name is not None:
        pm.name = data.name
    if data.description is not None:
        pm.description = data.description
    if data.plate_type is not None:
        pm.plate_type = data.plate_type
    if data.well_data is not None:
        pm.well_data = json.dumps(data.well_data)
    if data.legend is not None:
        pm.legend = json.dumps(data.legend)

    db.commit()
    db.refresh(pm)
    return _to_read(pm)


@router.delete("/{id}", status_code=204)
def delete_plate_map(id: str, db: Session = Depends(get_db)):
    pm = db.get(PlateMap, id)
    if pm is None:
        raise HTTPException(status_code=404, detail="Plate map not found")
    db.delete(pm)
    db.commit()
