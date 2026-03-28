from __future__ import annotations

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from database import get_db
from models import AntibodyTag
from models import AntibodyTagAssignment
from schemas import TagCreate
from schemas import TagRead

router = APIRouter()


class TagWithCount(TagRead):
    antibody_count: int = 0


@router.get("/", response_model=list[TagWithCount])
def list_tags(db: Session = Depends(get_db)):
    tags = list(db.scalars(select(AntibodyTag).order_by(AntibodyTag.name)))
    result = []
    for tag in tags:
        count = db.scalar(
            select(func.count()).select_from(AntibodyTagAssignment).where(
                AntibodyTagAssignment.tag_id == tag.id
            )
        )
        result.append({
            "id": tag.id,
            "name": tag.name,
            "color": tag.color,
            "antibody_count": count or 0,
        })
    return result


@router.post("/", response_model=TagRead, status_code=201)
def create_tag(data: TagCreate, db: Session = Depends(get_db)):
    tag = AntibodyTag(name=data.name, color=data.color)
    try:
        db.add(tag)
        db.commit()
        db.refresh(tag)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Tag with this name already exists")
    return tag


@router.put("/{id}", response_model=TagRead)
def update_tag(id: str, data: TagCreate, db: Session = Depends(get_db)):
    tag = db.get(AntibodyTag, id)
    if tag is None:
        raise HTTPException(status_code=404, detail="Tag not found")
    tag.name = data.name
    tag.color = data.color
    try:
        db.commit()
        db.refresh(tag)
    except IntegrityError:
        db.rollback()
        raise HTTPException(status_code=409, detail="Tag with this name already exists")
    return tag


@router.delete("/{id}", status_code=204)
def delete_tag(id: str, db: Session = Depends(get_db)):
    tag = db.get(AntibodyTag, id)
    if tag is None:
        raise HTTPException(status_code=404, detail="Tag not found")
    db.delete(tag)
    db.commit()
