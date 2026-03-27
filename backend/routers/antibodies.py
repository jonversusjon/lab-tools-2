from __future__ import annotations

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm import joinedload

from database import get_db
from models import Antibody
from models import Fluorophore
from schemas import AntibodyCreate
from schemas import AntibodyRead
from schemas import AntibodyUpdate
from schemas import PaginatedResponse

router = APIRouter()


def _to_read(ab: Antibody) -> dict:
    data = {
        "id": ab.id,
        "target": ab.target,
        "clone": ab.clone,
        "host": ab.host,
        "isotype": ab.isotype,
        "fluorophore_id": ab.fluorophore_id,
        "vendor": ab.vendor,
        "catalog_number": ab.catalog_number,
        "fluorophore_name": ab.fluorophore.name if ab.fluorophore else None,
    }
    return data


@router.get("/", response_model=PaginatedResponse[AntibodyRead])
def list_antibodies(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    limit = min(limit, 500)
    stmt = (
        select(Antibody)
        .options(joinedload(Antibody.fluorophore))
        .offset(skip)
        .limit(limit)
    )
    items = list(db.scalars(stmt).unique())
    total = db.scalar(select(func.count()).select_from(Antibody))
    return {
        "items": [_to_read(ab) for ab in items],
        "total": total,
        "skip": skip,
        "limit": limit,
    }


@router.post("/", response_model=AntibodyRead, status_code=201)
def create_antibody(
    data: AntibodyCreate,
    db: Session = Depends(get_db),
):
    if data.fluorophore_id is not None:
        fl = db.get(Fluorophore, data.fluorophore_id)
        if fl is None:
            raise HTTPException(status_code=404, detail="Fluorophore not found")

    antibody = Antibody(
        target=data.target,
        clone=data.clone,
        host=data.host,
        isotype=data.isotype,
        fluorophore_id=data.fluorophore_id,
        vendor=data.vendor,
        catalog_number=data.catalog_number,
    )
    db.add(antibody)
    db.commit()
    db.refresh(antibody)

    stmt = (
        select(Antibody)
        .options(joinedload(Antibody.fluorophore))
        .where(Antibody.id == antibody.id)
    )
    antibody = db.scalars(stmt).first()
    return _to_read(antibody)


@router.get("/{id}", response_model=AntibodyRead)
def get_antibody(id: str, db: Session = Depends(get_db)):
    stmt = (
        select(Antibody)
        .options(joinedload(Antibody.fluorophore))
        .where(Antibody.id == id)
    )
    antibody = db.scalars(stmt).first()
    if antibody is None:
        raise HTTPException(status_code=404, detail="Antibody not found")
    return _to_read(antibody)


@router.put("/{id}", response_model=AntibodyRead)
def update_antibody(
    id: str,
    data: AntibodyUpdate,
    db: Session = Depends(get_db),
):
    antibody = db.get(Antibody, id)
    if antibody is None:
        raise HTTPException(status_code=404, detail="Antibody not found")

    if data.fluorophore_id is not None:
        fl = db.get(Fluorophore, data.fluorophore_id)
        if fl is None:
            raise HTTPException(status_code=404, detail="Fluorophore not found")

    antibody.target = data.target
    antibody.clone = data.clone
    antibody.host = data.host
    antibody.isotype = data.isotype
    antibody.fluorophore_id = data.fluorophore_id
    antibody.vendor = data.vendor
    antibody.catalog_number = data.catalog_number
    db.commit()

    stmt = (
        select(Antibody)
        .options(joinedload(Antibody.fluorophore))
        .where(Antibody.id == antibody.id)
    )
    antibody = db.scalars(stmt).first()
    return _to_read(antibody)


@router.delete("/{id}", status_code=204)
def delete_antibody(id: str, db: Session = Depends(get_db)):
    antibody = db.get(Antibody, id)
    if antibody is None:
        raise HTTPException(status_code=404, detail="Antibody not found")
    db.delete(antibody)
    db.commit()
