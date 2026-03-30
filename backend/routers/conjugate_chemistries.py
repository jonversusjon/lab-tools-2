from __future__ import annotations

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import ConjugateChemistry
from schemas import ConjugateChemistryCreate
from schemas import ConjugateChemistryRead
from schemas import ConjugateChemistryUpdate

router = APIRouter()


@router.get("/", response_model=list[ConjugateChemistryRead])
def list_conjugate_chemistries(db: Session = Depends(get_db)):
    stmt = select(ConjugateChemistry).order_by(
        ConjugateChemistry.sort_order, ConjugateChemistry.name
    )
    return db.scalars(stmt).all()


@router.post("/", response_model=ConjugateChemistryRead, status_code=201)
def create_conjugate_chemistry(
    data: ConjugateChemistryCreate,
    db: Session = Depends(get_db),
):
    name = data.name.strip().lower()
    label = data.label.strip()
    if not name:
        raise HTTPException(status_code=400, detail="Name cannot be empty.")
    if not label:
        raise HTTPException(status_code=400, detail="Label cannot be empty.")

    existing = db.scalar(
        select(ConjugateChemistry).where(ConjugateChemistry.name == name)
    )
    if existing:
        raise HTTPException(status_code=409, detail="Already exists: %s" % name)

    max_order = db.scalar(select(func.max(ConjugateChemistry.sort_order)))
    entry = ConjugateChemistry(
        name=name,
        label=label,
        sort_order=(max_order or 0) + 1,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.put("/{entry_id}", response_model=ConjugateChemistryRead)
def update_conjugate_chemistry(
    entry_id: str,
    data: ConjugateChemistryUpdate,
    db: Session = Depends(get_db),
):
    entry = db.get(ConjugateChemistry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found.")

    if data.name is not None:
        name = data.name.strip().lower()
        if not name:
            raise HTTPException(status_code=400, detail="Name cannot be empty.")
        # Check uniqueness against other entries
        dup = db.scalar(
            select(ConjugateChemistry).where(
                ConjugateChemistry.name == name,
                ConjugateChemistry.id != entry_id,
            )
        )
        if dup:
            raise HTTPException(status_code=409, detail="Already exists: %s" % name)
        entry.name = name

    if data.label is not None:
        label = data.label.strip()
        if not label:
            raise HTTPException(status_code=400, detail="Label cannot be empty.")
        entry.label = label

    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{entry_id}", status_code=204)
def delete_conjugate_chemistry(
    entry_id: str,
    db: Session = Depends(get_db),
):
    entry = db.get(ConjugateChemistry, entry_id)
    if entry is None:
        raise HTTPException(status_code=404, detail="Entry not found.")
    db.delete(entry)
    db.commit()
