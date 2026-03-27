from __future__ import annotations

from fastapi import APIRouter
from fastapi import Depends
from sqlalchemy.orm import Session

from database import get_db
from schemas import AntibodyCreate
from schemas import AntibodyRead
from schemas import AntibodyUpdate
from schemas import PaginatedResponse

router = APIRouter()


@router.get("/", response_model=PaginatedResponse[AntibodyRead])
def list_antibodies(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    raise NotImplementedError


@router.post("/", response_model=AntibodyRead, status_code=201)
def create_antibody(
    antibody: AntibodyCreate,
    db: Session = Depends(get_db),
):
    raise NotImplementedError


@router.get("/{id}", response_model=AntibodyRead)
def get_antibody(id: str, db: Session = Depends(get_db)):
    raise NotImplementedError


@router.put("/{id}", response_model=AntibodyRead)
def update_antibody(
    id: str,
    antibody: AntibodyUpdate,
    db: Session = Depends(get_db),
):
    raise NotImplementedError


@router.delete("/{id}", status_code=204)
def delete_antibody(id: str, db: Session = Depends(get_db)):
    raise NotImplementedError
