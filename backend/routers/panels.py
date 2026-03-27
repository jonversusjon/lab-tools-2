from __future__ import annotations

from fastapi import APIRouter
from fastapi import Depends
from sqlalchemy.orm import Session

from database import get_db
from schemas import PaginatedResponse
from schemas import PanelAssignmentCreate
from schemas import PanelAssignmentRead
from schemas import PanelCreate
from schemas import PanelRead
from schemas import PanelTargetCreate
from schemas import PanelTargetRead
from schemas import PanelUpdate

router = APIRouter()


@router.get("/", response_model=PaginatedResponse[PanelRead])
def list_panels(
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    raise NotImplementedError


@router.post("/", response_model=PanelRead, status_code=201)
def create_panel(
    panel: PanelCreate,
    db: Session = Depends(get_db),
):
    raise NotImplementedError


@router.get("/{id}", response_model=PanelRead)
def get_panel(id: str, db: Session = Depends(get_db)):
    raise NotImplementedError


@router.put("/{id}", response_model=PanelRead)
def update_panel(
    id: str,
    panel: PanelUpdate,
    db: Session = Depends(get_db),
):
    raise NotImplementedError


@router.delete("/{id}", status_code=204)
def delete_panel(id: str, db: Session = Depends(get_db)):
    raise NotImplementedError


@router.post("/{id}/targets", response_model=PanelTargetRead, status_code=201)
def add_target(
    id: str,
    target: PanelTargetCreate,
    db: Session = Depends(get_db),
):
    raise NotImplementedError


@router.delete("/{id}/targets/{target_id}", status_code=204)
def remove_target(
    id: str,
    target_id: str,
    db: Session = Depends(get_db),
):
    raise NotImplementedError


@router.post("/{id}/assignments", response_model=PanelAssignmentRead, status_code=201)
def add_assignment(
    id: str,
    assignment: PanelAssignmentCreate,
    db: Session = Depends(get_db),
):
    raise NotImplementedError


@router.delete("/{id}/assignments/{assignment_id}", status_code=204)
def remove_assignment(
    id: str,
    assignment_id: str,
    db: Session = Depends(get_db),
):
    raise NotImplementedError
