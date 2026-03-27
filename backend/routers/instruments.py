from __future__ import annotations

from fastapi import APIRouter
from fastapi import Depends
from sqlalchemy.orm import Session

from database import get_db
from schemas import InstrumentCreate
from schemas import InstrumentRead
from schemas import InstrumentUpdate
from schemas import PaginatedResponse

router = APIRouter()


@router.get("/", response_model=PaginatedResponse[InstrumentRead])
def list_instruments(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    raise NotImplementedError


@router.post("/", response_model=InstrumentRead, status_code=201)
def create_instrument(
    instrument: InstrumentCreate,
    db: Session = Depends(get_db),
):
    raise NotImplementedError


@router.get("/{id}", response_model=InstrumentRead)
def get_instrument(id: str, db: Session = Depends(get_db)):
    raise NotImplementedError


@router.put("/{id}", response_model=InstrumentRead)
def update_instrument(
    id: str,
    instrument: InstrumentUpdate,
    db: Session = Depends(get_db),
):
    raise NotImplementedError


@router.delete("/{id}", status_code=204)
def delete_instrument(id: str, db: Session = Depends(get_db)):
    raise NotImplementedError
