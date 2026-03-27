from __future__ import annotations

from fastapi import APIRouter
from fastapi import Depends
from sqlalchemy.orm import Session

from database import get_db
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
    raise NotImplementedError


@router.post("/", response_model=FluorophoreRead, status_code=201)
def create_fluorophore(
    fluorophore: FluorophoreCreate,
    db: Session = Depends(get_db),
):
    raise NotImplementedError


@router.get("/{id}/spectra", response_model=FluorophoreSpectraRead)
def get_fluorophore_spectra(id: str, db: Session = Depends(get_db)):
    raise NotImplementedError


@router.post("/fetch-fpbase")
def fetch_fpbase(request: FetchFpbaseRequest):
    raise NotImplementedError


@router.post("/batch-spectra")
def batch_spectra(
    request: BatchSpectraRequest,
    db: Session = Depends(get_db),
):
    raise NotImplementedError
