from __future__ import annotations

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import Fluorophore
from schemas import BatchSpectraRequest
from schemas import FetchFpbaseRequest
from schemas import FluorophoreCreate
from schemas import FluorophoreRead
from schemas import FluorophoreSpectraRead
from schemas import PaginatedResponse

router = APIRouter()


@router.get("/", response_model=PaginatedResponse[FluorophoreRead])
def list_fluorophores(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    limit = min(limit, 500)
    stmt = select(Fluorophore).offset(skip).limit(limit)
    items = list(db.scalars(stmt))
    total = db.scalar(select(func.count()).select_from(Fluorophore))
    return {"items": items, "total": total, "skip": skip, "limit": limit}


@router.post("/", response_model=FluorophoreRead, status_code=201)
def create_fluorophore(
    data: FluorophoreCreate,
    db: Session = Depends(get_db),
):
    fluorophore = Fluorophore(
        name=data.name,
        excitation_max_nm=data.excitation_max_nm,
        emission_max_nm=data.emission_max_nm,
        spectra=data.spectra,
        source=data.source,
    )
    db.add(fluorophore)
    try:
        db.commit()
    except Exception:
        db.rollback()
        raise HTTPException(status_code=409, detail="Fluorophore name already exists")
    db.refresh(fluorophore)
    return fluorophore


@router.get("/{id}/spectra", response_model=FluorophoreSpectraRead)
def get_fluorophore_spectra(id: str, db: Session = Depends(get_db)):
    fluorophore = db.get(Fluorophore, id)
    if fluorophore is None:
        raise HTTPException(status_code=404, detail="Fluorophore not found")
    return fluorophore


@router.post("/fetch-fpbase")
def fetch_fpbase(request: FetchFpbaseRequest):
    raise HTTPException(status_code=501, detail="FPbase integration not yet implemented")


@router.post("/batch-spectra")
def batch_spectra(
    request: BatchSpectraRequest,
    db: Session = Depends(get_db),
):
    if len(request.ids) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 IDs per request")

    stmt = select(Fluorophore).where(Fluorophore.id.in_(request.ids))
    fluorophores = list(db.scalars(stmt))
    result = {}
    for fl in fluorophores:
        result[fl.id] = fl.spectra
    return result
