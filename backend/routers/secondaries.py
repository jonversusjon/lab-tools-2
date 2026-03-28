from __future__ import annotations

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy import or_
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import Fluorophore
from models import SecondaryAntibody
from schemas import PaginatedResponse
from schemas import SecondaryAntibodyCreate
from schemas import SecondaryAntibodyResponse
from schemas import SecondaryAntibodyUpdate

router = APIRouter()


def _to_response(sa: SecondaryAntibody) -> dict:
    return {
        "id": sa.id,
        "name": sa.name,
        "host": sa.host,
        "target_species": sa.target_species,
        "target_isotype": sa.target_isotype,
        "fluorophore_id": sa.fluorophore_id,
        "fluorophore_name": sa.fluorophore.name if sa.fluorophore else None,
        "vendor": sa.vendor,
        "catalog_number": sa.catalog_number,
        "lot_number": sa.lot_number,
        "notes": sa.notes,
        "created_at": sa.created_at,
        "updated_at": sa.updated_at,
    }


@router.get("/", response_model=PaginatedResponse[SecondaryAntibodyResponse])
def list_secondary_antibodies(
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
    host: str | None = None,
    target_species: str | None = None,
    target_isotype: str | None = None,
    db: Session = Depends(get_db),
):
    limit = min(limit, 500)
    stmt = select(SecondaryAntibody)

    if search:
        pattern = "%%%s%%" % search
        stmt = stmt.where(
            or_(
                SecondaryAntibody.name.ilike(pattern),
                SecondaryAntibody.catalog_number.ilike(pattern),
            )
        )
    if host:
        stmt = stmt.where(SecondaryAntibody.host == host)
    if target_species:
        stmt = stmt.where(SecondaryAntibody.target_species == target_species)
    if target_isotype:
        stmt = stmt.where(SecondaryAntibody.target_isotype == target_isotype)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    results = list(db.scalars(stmt.offset(skip).limit(limit)))
    items = [_to_response(sa) for sa in results]
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("/", response_model=SecondaryAntibodyResponse, status_code=201)
def create_secondary_antibody(
    data: SecondaryAntibodyCreate,
    db: Session = Depends(get_db),
):
    if data.fluorophore_id is not None:
        fl = db.get(Fluorophore, data.fluorophore_id)
        if fl is None:
            raise HTTPException(status_code=404, detail="Fluorophore not found")

    sa = SecondaryAntibody(**data.model_dump())
    db.add(sa)
    db.commit()
    db.refresh(sa)
    return _to_response(sa)


@router.get("/{id}", response_model=SecondaryAntibodyResponse)
def get_secondary_antibody(id: str, db: Session = Depends(get_db)):
    sa = db.get(SecondaryAntibody, id)
    if sa is None:
        raise HTTPException(status_code=404, detail="Secondary antibody not found")
    return _to_response(sa)


@router.put("/{id}", response_model=SecondaryAntibodyResponse)
def update_secondary_antibody(
    id: str,
    data: SecondaryAntibodyUpdate,
    db: Session = Depends(get_db),
):
    sa = db.get(SecondaryAntibody, id)
    if sa is None:
        raise HTTPException(status_code=404, detail="Secondary antibody not found")

    if data.fluorophore_id is not None:
        fl = db.get(Fluorophore, data.fluorophore_id)
        if fl is None:
            raise HTTPException(status_code=404, detail="Fluorophore not found")

    for key, value in data.model_dump().items():
        setattr(sa, key, value)
    db.commit()
    db.refresh(sa)
    return _to_response(sa)


@router.delete("/{id}", status_code=204)
def delete_secondary_antibody(id: str, db: Session = Depends(get_db)):
    sa = db.get(SecondaryAntibody, id)
    if sa is None:
        raise HTTPException(status_code=404, detail="Secondary antibody not found")
    db.delete(sa)
    db.commit()
