from __future__ import annotations

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy import or_
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models import DyeLabel
from models import Fluorophore
from schemas import DyeLabelCreate
from schemas import DyeLabelResponse
from schemas import DyeLabelUpdate
from schemas import FavoriteToggle
from schemas import PaginatedResponse
from services.dilutions import parse_dilution
from utils import tokenize_search

router = APIRouter()


def _to_response(dl: DyeLabel) -> dict:
    return {
        "id": dl.id,
        "name": dl.name,
        "label_target": dl.label_target,
        "category": dl.category,
        "fluorophore_id": dl.fluorophore_id,
        "fluorophore_name": dl.fluorophore.name if dl.fluorophore else None,
        "vendor": dl.vendor,
        "catalog_number": dl.catalog_number,
        "lot_number": dl.lot_number,
        "flow_dilution": dl.flow_dilution,
        "icc_if_dilution": dl.icc_if_dilution,
        "flow_dilution_factor": dl.flow_dilution_factor,
        "icc_if_dilution_factor": dl.icc_if_dilution_factor,
        "notes": dl.notes,
        "is_favorite": dl.is_favorite,
        "created_at": dl.created_at,
        "updated_at": dl.updated_at,
    }


@router.get("/", response_model=PaginatedResponse[DyeLabelResponse])
def list_dye_labels(
    skip: int = 0,
    limit: int = 100,
    search: str | None = None,
    category: str | None = None,
    db: Session = Depends(get_db),
):
    limit = min(limit, 500)
    stmt = select(DyeLabel)

    if search:
        for token in tokenize_search(search):
            pattern = "%%%s%%" % token
            stmt = stmt.where(
                or_(
                    DyeLabel.name.ilike(pattern),
                    DyeLabel.label_target.ilike(pattern),
                    DyeLabel.category.ilike(pattern),
                    DyeLabel.vendor.ilike(pattern),
                    DyeLabel.catalog_number.ilike(pattern),
                )
            )
    if category:
        stmt = stmt.where(DyeLabel.category == category)

    total = db.scalar(select(func.count()).select_from(stmt.subquery()))
    results = list(db.scalars(stmt.offset(skip).limit(limit)))
    items = [_to_response(dl) for dl in results]
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("/", response_model=DyeLabelResponse, status_code=201)
def create_dye_label(
    data: DyeLabelCreate,
    db: Session = Depends(get_db),
):
    if data.fluorophore_id is not None:
        fl = db.get(Fluorophore, data.fluorophore_id)
        if fl is None:
            raise HTTPException(status_code=404, detail="Fluorophore not found")

    flow_factor = parse_dilution(data.flow_dilution)
    icc_if_factor = parse_dilution(data.icc_if_dilution)

    dl = DyeLabel(
        name=data.name,
        label_target=data.label_target,
        category=data.category,
        fluorophore_id=data.fluorophore_id,
        vendor=data.vendor,
        catalog_number=data.catalog_number,
        lot_number=data.lot_number,
        flow_dilution=data.flow_dilution,
        icc_if_dilution=data.icc_if_dilution,
        flow_dilution_factor=flow_factor,
        icc_if_dilution_factor=icc_if_factor,
        notes=data.notes,
    )
    db.add(dl)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A dye/label with this name already exists")
    db.refresh(dl)
    return _to_response(dl)


@router.get("/{id}", response_model=DyeLabelResponse)
def get_dye_label(id: str, db: Session = Depends(get_db)):
    dl = db.get(DyeLabel, id)
    if dl is None:
        raise HTTPException(status_code=404, detail="Dye/label not found")
    return _to_response(dl)


@router.put("/{id}", response_model=DyeLabelResponse)
def update_dye_label(
    id: str,
    data: DyeLabelUpdate,
    db: Session = Depends(get_db),
):
    dl = db.get(DyeLabel, id)
    if dl is None:
        raise HTTPException(status_code=404, detail="Dye/label not found")

    if data.fluorophore_id is not None:
        fl = db.get(Fluorophore, data.fluorophore_id)
        if fl is None:
            raise HTTPException(status_code=404, detail="Fluorophore not found")

    dl.name = data.name
    dl.label_target = data.label_target
    dl.category = data.category
    dl.fluorophore_id = data.fluorophore_id
    dl.vendor = data.vendor
    dl.catalog_number = data.catalog_number
    dl.lot_number = data.lot_number
    dl.flow_dilution = data.flow_dilution
    dl.icc_if_dilution = data.icc_if_dilution
    dl.flow_dilution_factor = parse_dilution(data.flow_dilution)
    dl.icc_if_dilution_factor = parse_dilution(data.icc_if_dilution)
    dl.notes = data.notes

    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="A dye/label with this name already exists")
    db.refresh(dl)
    return _to_response(dl)


@router.delete("/{id}", status_code=204)
def delete_dye_label(id: str, db: Session = Depends(get_db)):
    dl = db.get(DyeLabel, id)
    if dl is None:
        raise HTTPException(status_code=404, detail="Dye/label not found")
    db.delete(dl)
    db.commit()


@router.patch("/{id}/favorite", response_model=DyeLabelResponse)
def toggle_favorite(
    id: str,
    body: FavoriteToggle,
    db: Session = Depends(get_db),
):
    dl = db.get(DyeLabel, id)
    if dl is None:
        raise HTTPException(status_code=404, detail="Dye/label not found")
    dl.is_favorite = body.is_favorite
    db.commit()
    db.refresh(dl)
    return _to_response(dl)
