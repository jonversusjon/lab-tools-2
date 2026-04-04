from __future__ import annotations

from difflib import SequenceMatcher

from fastapi import APIRouter
from fastapi import Depends
from fastapi import HTTPException
from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy.orm import Session

from database import get_db
from models import ListEntry
from schemas import ListEntryCreate
from schemas import ListEntryRead
from schemas import ListEntryUpdate

router = APIRouter()

VALID_LIST_TYPES = {"host", "target_species", "instrument_location"}

FUZZY_THRESHOLD = 0.85


def _normalize(s: str) -> str:
    return s.strip().lower()


def _find_fuzzy_match(value: str, existing: list[str]) -> str | None:
    """Return the first existing entry that fuzzy-matches value, or None."""
    norm = _normalize(value)
    for entry in existing:
        if _normalize(entry) == norm:
            return entry
        ratio = SequenceMatcher(None, norm, _normalize(entry)).ratio()
        if ratio >= FUZZY_THRESHOLD:
            return entry
    return None


def _validate_list_type(list_type: str) -> None:
    if list_type not in VALID_LIST_TYPES:
        raise HTTPException(
            status_code=400,
            detail="list_type must be one of: %s" % ", ".join(sorted(VALID_LIST_TYPES)),
        )


@router.get("/{list_type}", response_model=list[ListEntryRead])
def get_list_entries(
    list_type: str,
    db: Session = Depends(get_db),
):
    _validate_list_type(list_type)
    stmt = (
        select(ListEntry)
        .where(ListEntry.list_type == list_type)
        .order_by(ListEntry.sort_order, ListEntry.value)
    )
    return db.scalars(stmt).all()


@router.post("/{list_type}", response_model=ListEntryRead, status_code=201)
def create_list_entry(
    list_type: str,
    data: ListEntryCreate,
    db: Session = Depends(get_db),
):
    _validate_list_type(list_type)
    value = data.value.strip()
    if not value:
        raise HTTPException(status_code=400, detail="Value cannot be empty.")

    existing_values = [
        row[0]
        for row in db.execute(
            select(ListEntry.value).where(ListEntry.list_type == list_type)
        ).all()
    ]

    match = _find_fuzzy_match(value, existing_values)
    if match is not None:
        raise HTTPException(
            status_code=409,
            detail="Already exists: %s" % match,
        )

    max_order = db.scalar(
        select(func.max(ListEntry.sort_order)).where(ListEntry.list_type == list_type)
    )
    entry = ListEntry(
        list_type=list_type,
        value=value,
        sort_order=(max_order or 0) + 1,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    return entry


@router.put("/{list_type}/{entry_id}", response_model=ListEntryRead)
def update_list_entry(
    list_type: str,
    entry_id: str,
    data: ListEntryUpdate,
    db: Session = Depends(get_db),
):
    _validate_list_type(list_type)
    entry = db.get(ListEntry, entry_id)
    if entry is None or entry.list_type != list_type:
        raise HTTPException(status_code=404, detail="Entry not found.")

    value = data.value.strip()
    if not value:
        raise HTTPException(status_code=400, detail="Value cannot be empty.")

    # Check fuzzy match against other entries (excluding self)
    existing_values = [
        row[0]
        for row in db.execute(
            select(ListEntry.value).where(
                ListEntry.list_type == list_type,
                ListEntry.id != entry_id,
            )
        ).all()
    ]

    match = _find_fuzzy_match(value, existing_values)
    if match is not None:
        raise HTTPException(
            status_code=409,
            detail="Already exists: %s" % match,
        )

    entry.value = value
    db.commit()
    db.refresh(entry)
    return entry


@router.delete("/{list_type}/{entry_id}", status_code=204)
def delete_list_entry(
    list_type: str,
    entry_id: str,
    db: Session = Depends(get_db),
):
    _validate_list_type(list_type)
    entry = db.get(ListEntry, entry_id)
    if entry is None or entry.list_type != list_type:
        raise HTTPException(status_code=404, detail="Entry not found.")

    db.delete(entry)
    db.commit()
