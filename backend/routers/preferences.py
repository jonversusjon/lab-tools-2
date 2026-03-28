from __future__ import annotations

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import UserPreference
from schemas import PreferenceRead
from schemas import PreferenceUpdate

router = APIRouter()


@router.get("/", response_model=dict[str, str])
def get_preferences(db: Session = Depends(get_db)):
    prefs = db.scalars(select(UserPreference)).all()
    return {p.key: p.value for p in prefs}


@router.put("/{key}", response_model=PreferenceRead)
def update_preference(
    key: str,
    data: PreferenceUpdate,
    db: Session = Depends(get_db),
):
    pref = db.get(UserPreference, key)
    if pref is None:
        pref = UserPreference(key=key, value=data.value)
        db.add(pref)
    else:
        pref.value = data.value

    db.commit()
    return pref
