from __future__ import annotations

import json
import logging
from datetime import datetime
from datetime import timezone
from typing import Any
from typing import Callable

from fastapi import APIRouter
from fastapi import Body
from fastapi import Depends
from fastapi import HTTPException
from fastapi import Response
from sqlalchemy import func
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm import selectinload

logger = logging.getLogger(__name__)

from database import get_db
from models import Antibody
from models import AntibodyTag
from models import AntibodyTagAssignment
from models import ConjugateChemistry
from models import Detector
from models import DyeLabel
from models import Experiment
from models import ExperimentBlock
from models import Fluorophore
from models import IFPanel
from models import IFPanelAssignment
from models import IFPanelTarget
from models import Instrument
from models import Laser
from models import ListEntry
from models import Microscope
from models import MicroscopeFilter
from models import MicroscopeLaser
from models import Panel
from models import PanelAssignment
from models import PanelTarget
from models import PlateMap
from models import SecondaryAntibody

router = APIRouter()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _json_download(data: dict, filename: str) -> Response:
    content = json.dumps(data, default=str, indent=2)
    return Response(
        content=content,
        media_type="application/json",
        headers={"Content-Disposition": "attachment; filename=\"%s\"" % filename},
    )


# ── GENERIC DIFF HELPERS ──────────────────────────────────────────────────────

_TIMESTAMP_KEYS = ("created_at", "updated_at")


def _diff_fields(existing: dict[str, Any], imported: dict[str, Any]) -> list[str]:
    """Return sorted list of field names that differ between the two dicts (across union of keys)."""
    keys = set(existing.keys()) | set(imported.keys())
    diffs: list[str] = []
    for k in keys:
        a = existing.get(k)
        b = imported.get(k)
        if isinstance(a, list) and isinstance(b, list):
            try:
                if sorted(a) != sorted(b):
                    diffs.append(k)
            except TypeError:
                # List of dicts or mixed — fall back to structural equality
                if a != b:
                    diffs.append(k)
        elif a != b:
            diffs.append(k)
    return sorted(diffs)


def _sanitize_generic(
    rec: dict[str, Any],
    allowed: set[str],
    list_fields: tuple[str, ...] = (),
) -> tuple[dict[str, Any], list[str]]:
    """Strip unknown keys. Normalize list-typed fields to sorted lists."""
    dropped = sorted(k for k in rec.keys() if k not in allowed and k not in _TIMESTAMP_KEYS)
    clean = {k: rec[k] for k in rec.keys() if k in allowed}
    for lf in list_fields:
        if lf in allowed:
            clean[lf] = sorted(clean.get(lf) or [])
    return clean, dropped


def _preview_generic(
    records_raw: list[dict[str, Any]],
    existing_rows: dict[str, Any],
    fields: tuple[str, ...],
    to_dict_fn: Callable[[Any], dict[str, Any]],
    list_fields: tuple[str, ...] = (),
) -> dict[str, Any]:
    """Compute new_items, conflicts, and property drift for any flat resource.

    Assumes the model's PK field is 'id' and is part of `fields`.
    """
    allowed = set(fields) | set(list_fields)
    new_items: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    all_dropped: set[str] = set()
    all_present: set[str] = set()

    for raw in records_raw:
        clean, dropped = _sanitize_generic(dict(raw), allowed, list_fields)
        all_dropped.update(dropped)
        all_present.update(k for k in raw.keys() if k not in _TIMESTAMP_KEYS)

        rec_id = clean.get("id")
        if rec_id and rec_id in existing_rows:
            existing_dict = to_dict_fn(existing_rows[rec_id])
            diff = _diff_fields(existing_dict, clean)
            if diff:
                conflicts.append({
                    "id": rec_id,
                    "existing": existing_dict,
                    "imported": clean,
                    "diff_fields": diff,
                })
            # else identical — silently skip
        else:
            new_items.append(clean)

    db_only_props = sorted(f for f in fields if f not in all_present and f != "id")
    import_only_props = sorted(all_dropped)
    return {
        "new_items": new_items,
        "conflicts": conflicts,
        "db_only_props": db_only_props,
        "import_only_props": import_only_props,
    }


# ── ANTIBODIES ────────────────────────────────────────────────────────────────

@router.get("/export/antibodies")
def export_antibodies(db: Session = Depends(get_db)):
    antibodies = list(db.scalars(
        select(Antibody).options(selectinload(Antibody.tags))
    ).all())
    tags = list(db.scalars(select(AntibodyTag)).all())
    return _json_download({
        "version": 1,
        "resource": "antibodies",
        "exported_at": _now_iso(),
        "tags": [{"id": t.id, "name": t.name, "color": t.color} for t in tags],
        "records": [
            {
                "id": ab.id, "target": ab.target, "name": ab.name,
                "clone": ab.clone, "host": ab.host, "isotype": ab.isotype,
                "fluorophore_id": ab.fluorophore_id, "conjugate": ab.conjugate,
                "vendor": ab.vendor, "catalog_number": ab.catalog_number,
                "confirmed_in_stock": ab.confirmed_in_stock,
                "date_received": ab.date_received,
                "flow_dilution": ab.flow_dilution,
                "icc_if_dilution": ab.icc_if_dilution,
                "wb_dilution": ab.wb_dilution,
                "flow_dilution_factor": ab.flow_dilution_factor,
                "icc_if_dilution_factor": ab.icc_if_dilution_factor,
                "wb_dilution_factor": ab.wb_dilution_factor,
                "reacts_with": ab.reacts_with,
                "storage_temp": ab.storage_temp,
                "validation_notes": ab.validation_notes,
                "notes": ab.notes, "website": ab.website,
                "physical_location": ab.physical_location,
                "is_favorite": ab.is_favorite,
                "tag_ids": [t.id for t in ab.tags],
            }
            for ab in antibodies
        ],
    }, "antibodies-export.json")


# Columns on Antibody that are compared + round-tripped through the import flow.
# Timestamps are excluded (server-managed).
_ANTIBODY_FIELDS = (
    "id", "name", "target", "clone", "host", "isotype",
    "fluorophore_id", "conjugate", "vendor", "catalog_number",
    "confirmed_in_stock", "date_received",
    "flow_dilution", "icc_if_dilution", "wb_dilution",
    "flow_dilution_factor", "icc_if_dilution_factor", "wb_dilution_factor",
    "reacts_with", "storage_temp", "validation_notes",
    "notes", "website", "physical_location", "is_favorite",
)


def _antibody_to_dict(ab: Antibody) -> dict[str, Any]:
    data = {f: getattr(ab, f) for f in _ANTIBODY_FIELDS}
    data["tag_ids"] = sorted([t.id for t in ab.tags])
    return data


def _sanitize_imported_antibody(rec: dict[str, Any]) -> tuple[dict[str, Any], list[str]]:
    """Strip unknown keys from an imported antibody record, return (clean_record, dropped_keys)."""
    allowed = set(_ANTIBODY_FIELDS) | {"tag_ids"}
    return _sanitize_generic(rec, allowed, list_fields=("tag_ids",))


@router.post("/import/antibodies/preview")
def import_antibodies_preview(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Diff-only endpoint. Returns new items, conflicts, and property drift. No writes."""
    tags_payload = payload.get("tags", []) or []
    records = payload.get("records", []) or []

    existing_rows = {
        ab.id: ab
        for ab in db.scalars(
            select(Antibody).options(selectinload(Antibody.tags))
        ).all()
    }
    existing_tags = {t.id: {"id": t.id, "name": t.name, "color": t.color}
                     for t in db.scalars(select(AntibodyTag)).all()}

    result = _preview_generic(
        records,
        existing_rows,
        _ANTIBODY_FIELDS,
        _antibody_to_dict,
        list_fields=("tag_ids",),
    )

    # Tags: merge-only for Phase 1. Report which tags are new vs already-known.
    new_tags = [t for t in tags_payload
                if t.get("id") and t["id"] not in existing_tags]

    return {
        "resource": "antibodies",
        **result,
        "tags": {
            "new": new_tags,
            "existing_count": len(existing_tags),
        },
    }


@router.post("/import/antibodies/commit")
def import_antibodies_commit(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    """Apply a resolved import. `records` is the final list to upsert; missing-FK refs are nulled."""
    tags_payload = payload.get("tags", []) or []
    records = payload.get("records", []) or []

    try:
        # Build a name→id map for existing tags so we can handle cross-DB imports
        # where the same tag name exists with a different UUID. AntibodyTag.name is
        # UNIQUE so inserting a second row with the same name raises IntegrityError.
        existing_tags_by_name: dict[str, str] = {
            t.name: t.id for t in db.scalars(select(AntibodyTag)).all()
        }
        # Maps imported_tag_id → canonical_tag_id (may differ when name collision)
        tag_id_map: dict[str, str] = {}

        for t in tags_payload:
            if not t.get("id") or not t.get("name"):
                continue
            imported_id: str = t["id"]
            tag_name: str = t["name"]
            if tag_name in existing_tags_by_name:
                # Reuse the existing tag; just update its color if provided
                canonical_id = existing_tags_by_name[tag_name]
                tag_id_map[imported_id] = canonical_id
                if t.get("color"):
                    db.merge(AntibodyTag(id=canonical_id, name=tag_name, color=t["color"]))
            else:
                # New tag — insert with the imported UUID
                db.merge(AntibodyTag(id=imported_id, name=tag_name, color=t.get("color")))
                tag_id_map[imported_id] = imported_id
                existing_tags_by_name[tag_name] = imported_id
        db.flush()

        existing_fluor_ids = set(db.scalars(select(Fluorophore.id)).all())
        existing_tag_ids = set(db.scalars(select(AntibodyTag.id)).all())
        nulled_fluorophores = 0
        skipped_tag_refs = 0

        for raw in records:
            clean, _ = _sanitize_imported_antibody(dict(raw))
            tag_ids = clean.pop("tag_ids", [])
            if not clean.get("id"):
                continue
            if clean.get("fluorophore_id") and clean["fluorophore_id"] not in existing_fluor_ids:
                clean["fluorophore_id"] = None
                nulled_fluorophores += 1
            db.merge(Antibody(**clean))
            db.flush()
            db.execute(
                AntibodyTagAssignment.__table__.delete().where(
                    AntibodyTagAssignment.antibody_id == clean["id"]
                )
            )
            for tag_id in tag_ids:
                canonical_id = tag_id_map.get(tag_id, tag_id)
                if canonical_id not in existing_tag_ids:
                    skipped_tag_refs += 1
                    continue
                db.merge(AntibodyTagAssignment(antibody_id=clean["id"], tag_id=canonical_id))

        db.commit()
        return {
            "imported": len(records),
            "tags_imported": len(tags_payload),
            "nulled_fluorophore_refs": nulled_fluorophores,
            "skipped_tag_refs": skipped_tag_refs,
        }
    except Exception as e:
        db.rollback()
        logger.exception("antibodies import commit failed")
        raise HTTPException(status_code=422, detail=str(e)) from e


# Legacy endpoint retained for non-diff callers (simple merge).
@router.post("/import/antibodies")
def import_antibodies(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    return import_antibodies_commit(payload=payload, db=db)


# ── SECONDARIES ───────────────────────────────────────────────────────────────

@router.get("/export/secondaries")
def export_secondaries(db: Session = Depends(get_db)):
    rows = list(db.scalars(select(SecondaryAntibody)).all())
    return _json_download({
        "version": 1,
        "resource": "secondaries",
        "exported_at": _now_iso(),
        "records": [
            {
                "id": s.id, "name": s.name, "host": s.host,
                "target_species": s.target_species,
                "target_isotype": s.target_isotype,
                "binding_mode": s.binding_mode,
                "target_conjugate": s.target_conjugate,
                "fluorophore_id": s.fluorophore_id,
                "vendor": s.vendor, "catalog_number": s.catalog_number,
                "lot_number": s.lot_number, "notes": s.notes,
            }
            for s in rows
        ],
    }, "secondaries-export.json")


_SECONDARY_FIELDS = (
    "id", "name", "host", "target_species", "target_isotype",
    "binding_mode", "target_conjugate", "fluorophore_id",
    "vendor", "catalog_number", "lot_number", "notes",
)


def _secondary_to_dict(s: SecondaryAntibody) -> dict[str, Any]:
    return {f: getattr(s, f) for f in _SECONDARY_FIELDS}


@router.post("/import/secondaries/preview")
def import_secondaries_preview(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    existing_rows = {s.id: s for s in db.scalars(select(SecondaryAntibody)).all()}
    return {
        "resource": "secondaries",
        **_preview_generic(records, existing_rows, _SECONDARY_FIELDS, _secondary_to_dict),
    }


@router.post("/import/secondaries/commit")
def import_secondaries_commit(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    existing_fluor_ids = set(db.scalars(select(Fluorophore.id)).all())
    nulled_fluorophores = 0
    allowed = set(_SECONDARY_FIELDS)
    try:
        for raw in records:
            clean, _ = _sanitize_generic(dict(raw), allowed)
            if not clean.get("id"):
                continue
            if clean.get("fluorophore_id") and clean["fluorophore_id"] not in existing_fluor_ids:
                clean["fluorophore_id"] = None
                nulled_fluorophores += 1
            # Guard NOT NULL columns so null values from the diff modal don't crash
            if not clean.get("binding_mode"):
                clean["binding_mode"] = "species"
            if clean.get("name") is None:
                clean["name"] = ""
            if clean.get("host") is None:
                clean["host"] = ""
            if clean.get("target_species") is None:
                clean["target_species"] = ""
            db.merge(SecondaryAntibody(**clean))
        db.commit()
        return {
            "imported": len(records),
            "nulled_fluorophore_refs": nulled_fluorophores,
        }
    except Exception as e:
        db.rollback()
        logger.exception("secondaries import commit failed")
        raise HTTPException(status_code=422, detail=str(e)) from e


# Legacy endpoint retained for non-diff callers.
@router.post("/import/secondaries")
def import_secondaries(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    return import_secondaries_commit(payload=payload, db=db)


# ── INSTRUMENTS ───────────────────────────────────────────────────────────────

@router.get("/export/instruments")
def export_instruments(db: Session = Depends(get_db)):
    instruments = list(db.scalars(
        select(Instrument).options(
            selectinload(Instrument.lasers).selectinload(Laser.detectors)
        )
    ).all())
    return _json_download({
        "version": 1,
        "resource": "instruments",
        "exported_at": _now_iso(),
        "records": [
            {
                "id": inst.id, "name": inst.name,
                "is_favorite": inst.is_favorite, "location": inst.location,
                "lasers": [
                    {
                        "id": l.id, "wavelength_nm": l.wavelength_nm, "name": l.name,
                        "detectors": [
                            {
                                "id": d.id, "filter_midpoint": d.filter_midpoint,
                                "filter_width": d.filter_width, "name": d.name,
                            }
                            for d in l.detectors
                        ],
                    }
                    for l in inst.lasers
                ],
            }
            for inst in instruments
        ],
    }, "instruments-export.json")


_INSTRUMENT_FIELDS = ("id", "name", "is_favorite", "location")
_LASER_FIELDS = ("id", "wavelength_nm", "name")
_DETECTOR_FIELDS = ("id", "filter_midpoint", "filter_width", "name")


def _instrument_to_dict(inst: Instrument) -> dict[str, Any]:
    return {
        "id": inst.id,
        "name": inst.name,
        "is_favorite": inst.is_favorite,
        "location": inst.location,
        "lasers": [
            {
                "id": l.id,
                "wavelength_nm": l.wavelength_nm,
                "name": l.name,
                "detectors": [
                    {
                        "id": d.id,
                        "filter_midpoint": d.filter_midpoint,
                        "filter_width": d.filter_width,
                        "name": d.name,
                    }
                    for d in sorted(l.detectors, key=lambda x: x.id)
                ],
            }
            for l in sorted(inst.lasers, key=lambda x: x.id)
        ],
    }


_INSTRUMENT_PREVIEW_FIELDS = _INSTRUMENT_FIELDS + ("lasers",)


@router.post("/import/instruments/preview")
def import_instruments_preview(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    existing_rows = {
        i.id: i
        for i in db.scalars(
            select(Instrument).options(
                selectinload(Instrument.lasers).selectinload(Laser.detectors)
            )
        ).all()
    }
    # Normalize import-side children order so diff is stable
    normalized = []
    for raw in records:
        rec = dict(raw)
        lasers = [dict(l) for l in (rec.get("lasers") or [])]
        for l in lasers:
            l["detectors"] = sorted(
                [dict(d) for d in (l.get("detectors") or [])],
                key=lambda d: str(d.get("id") or ""),
            )
        lasers.sort(key=lambda l: str(l.get("id") or ""))
        rec["lasers"] = lasers
        normalized.append(rec)
    # Count how many existing instruments have detectors referenced by panel assignments
    # (gives the user a heads-up that picking 'right' on those conflicts will cascade-delete assignments).
    result = _preview_generic(
        normalized, existing_rows, _INSTRUMENT_PREVIEW_FIELDS, _instrument_to_dict
    )
    fk_warnings = []
    for c in result["conflicts"]:
        inst_id = c["id"]
        detector_ids = [
            d["id"]
            for l in c["existing"].get("lasers", [])
            for d in l.get("detectors", [])
        ]
        if not detector_ids:
            continue
        count = db.scalar(
            select(func.count()).select_from(PanelAssignment).where(
                PanelAssignment.detector_id.in_(detector_ids)
            )
        ) or 0
        if count:
            fk_warnings.append({"id": inst_id, "assignments_at_risk": int(count)})
    return {
        "resource": "instruments",
        **result,
        "fk_warnings": fk_warnings,
    }


def _insert_instrument_tree(db: Session, rec: dict[str, Any]) -> None:
    """Upsert instrument, wipe existing lasers (cascades to detectors), re-insert from import."""
    lasers = rec.pop("lasers", []) or []
    allowed = set(_INSTRUMENT_FIELDS)
    clean_parent, _ = _sanitize_generic(rec, allowed)
    if not clean_parent.get("id"):
        return
    db.merge(Instrument(**clean_parent))
    db.flush()
    # Wipe existing children (CASCADE removes detectors and their panel assignments).
    db.execute(Laser.__table__.delete().where(Laser.instrument_id == clean_parent["id"]))
    db.flush()
    for l in lasers:
        detectors = (dict(l).pop("detectors", []) or [])
        laser_clean, _ = _sanitize_generic(dict(l), set(_LASER_FIELDS))
        if not laser_clean.get("id"):
            continue
        laser_clean["instrument_id"] = clean_parent["id"]
        db.merge(Laser(**laser_clean))
        db.flush()
        for d in detectors:
            det_clean, _ = _sanitize_generic(dict(d), set(_DETECTOR_FIELDS))
            if not det_clean.get("id"):
                continue
            det_clean["laser_id"] = laser_clean["id"]
            db.merge(Detector(**det_clean))


@router.post("/import/instruments/commit")
def import_instruments_commit(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    for rec in records:
        _insert_instrument_tree(db, dict(rec))
    db.commit()
    return {"imported": len(records)}


# Legacy endpoint retained for non-diff callers.
@router.post("/import/instruments")
def import_instruments(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    return import_instruments_commit(payload=payload, db=db)


# ── MICROSCOPES ───────────────────────────────────────────────────────────────

@router.get("/export/microscopes")
def export_microscopes(db: Session = Depends(get_db)):
    microscopes = list(db.scalars(
        select(Microscope).options(
            selectinload(Microscope.lasers).selectinload(MicroscopeLaser.filters)
        )
    ).all())
    return _json_download({
        "version": 1,
        "resource": "microscopes",
        "exported_at": _now_iso(),
        "records": [
            {
                "id": m.id, "name": m.name,
                "is_favorite": m.is_favorite, "location": m.location,
                "lasers": [
                    {
                        "id": l.id, "wavelength_nm": l.wavelength_nm, "name": l.name,
                        "excitation_type": l.excitation_type,
                        "ex_filter_width": l.ex_filter_width,
                        "filters": [
                            {
                                "id": f.id, "filter_midpoint": f.filter_midpoint,
                                "filter_width": f.filter_width, "name": f.name,
                            }
                            for f in l.filters
                        ],
                    }
                    for l in m.lasers
                ],
            }
            for m in microscopes
        ],
    }, "microscopes-export.json")


_MICROSCOPE_FIELDS = ("id", "name", "is_favorite", "location")
_MSCOPE_LASER_FIELDS = ("id", "wavelength_nm", "name", "excitation_type", "ex_filter_width")
_MSCOPE_FILTER_FIELDS = ("id", "filter_midpoint", "filter_width", "name")


def _microscope_to_dict(m: Microscope) -> dict[str, Any]:
    return {
        "id": m.id,
        "name": m.name,
        "is_favorite": m.is_favorite,
        "location": m.location,
        "lasers": [
            {
                "id": l.id,
                "wavelength_nm": l.wavelength_nm,
                "name": l.name,
                "excitation_type": l.excitation_type,
                "ex_filter_width": l.ex_filter_width,
                "filters": [
                    {
                        "id": f.id,
                        "filter_midpoint": f.filter_midpoint,
                        "filter_width": f.filter_width,
                        "name": f.name,
                    }
                    for f in sorted(l.filters, key=lambda x: x.id)
                ],
            }
            for l in sorted(m.lasers, key=lambda x: x.id)
        ],
    }


_MICROSCOPE_PREVIEW_FIELDS = _MICROSCOPE_FIELDS + ("lasers",)


@router.post("/import/microscopes/preview")
def import_microscopes_preview(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    existing_rows = {
        m.id: m
        for m in db.scalars(
            select(Microscope).options(
                selectinload(Microscope.lasers).selectinload(MicroscopeLaser.filters)
            )
        ).all()
    }
    normalized = []
    for raw in records:
        rec = dict(raw)
        lasers = [dict(l) for l in (rec.get("lasers") or [])]
        for l in lasers:
            l["filters"] = sorted(
                [dict(f) for f in (l.get("filters") or [])],
                key=lambda f: str(f.get("id") or ""),
            )
        lasers.sort(key=lambda l: str(l.get("id") or ""))
        rec["lasers"] = lasers
        normalized.append(rec)
    result = _preview_generic(
        normalized, existing_rows, _MICROSCOPE_PREVIEW_FIELDS, _microscope_to_dict
    )
    return {"resource": "microscopes", **result}


@router.post("/import/microscopes/commit")
def import_microscopes_commit(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    for rec in records:
        rec = dict(rec)
        lasers = rec.pop("lasers", []) or []
        parent_clean, _ = _sanitize_generic(rec, set(_MICROSCOPE_FIELDS))
        if not parent_clean.get("id"):
            continue
        db.merge(Microscope(**parent_clean))
        db.flush()
        db.execute(
            MicroscopeLaser.__table__.delete().where(
                MicroscopeLaser.microscope_id == parent_clean["id"]
            )
        )
        db.flush()
        for l in lasers:
            l = dict(l)
            filters = l.pop("filters", []) or []
            laser_clean, _ = _sanitize_generic(l, set(_MSCOPE_LASER_FIELDS))
            if not laser_clean.get("id"):
                continue
            laser_clean["microscope_id"] = parent_clean["id"]
            db.merge(MicroscopeLaser(**laser_clean))
            db.flush()
            for f in filters:
                filt_clean, _ = _sanitize_generic(dict(f), set(_MSCOPE_FILTER_FIELDS))
                if not filt_clean.get("id"):
                    continue
                filt_clean["laser_id"] = laser_clean["id"]
                db.merge(MicroscopeFilter(**filt_clean))
    db.commit()
    return {"imported": len(records)}


# Legacy endpoint retained for non-diff callers.
@router.post("/import/microscopes")
def import_microscopes(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    return import_microscopes_commit(payload=payload, db=db)


# ── LIST ENTRIES ──────────────────────────────────────────────────────────────

@router.get("/export/list-entries")
def export_list_entries(db: Session = Depends(get_db)):
    rows = list(db.scalars(
        select(ListEntry).order_by(ListEntry.list_type, ListEntry.sort_order)
    ).all())
    return _json_download({
        "version": 1,
        "resource": "list-entries",
        "exported_at": _now_iso(),
        "records": [
            {"id": e.id, "list_type": e.list_type, "value": e.value, "sort_order": e.sort_order}
            for e in rows
        ],
    }, "list-entries-export.json")


_LIST_ENTRY_FIELDS = ("id", "list_type", "value", "sort_order")


def _list_entry_to_dict(e: ListEntry) -> dict[str, Any]:
    return {f: getattr(e, f) for f in _LIST_ENTRY_FIELDS}


@router.post("/import/list-entries/preview")
def import_list_entries_preview(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    existing_rows = {e.id: e for e in db.scalars(select(ListEntry)).all()}
    return {
        "resource": "list-entries",
        **_preview_generic(records, existing_rows, _LIST_ENTRY_FIELDS, _list_entry_to_dict),
    }


@router.post("/import/list-entries/commit")
def import_list_entries_commit(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    allowed = set(_LIST_ENTRY_FIELDS)
    for raw in records:
        clean, _ = _sanitize_generic(dict(raw), allowed)
        if not clean.get("id"):
            continue
        db.merge(ListEntry(**clean))
    db.commit()
    return {"imported": len(records)}


# Legacy endpoint retained for non-diff callers.
@router.post("/import/list-entries")
def import_list_entries(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    return import_list_entries_commit(payload=payload, db=db)


# ── CONJUGATE CHEMISTRIES ─────────────────────────────────────────────────────

@router.get("/export/conjugate-chemistries")
def export_conjugate_chemistries(db: Session = Depends(get_db)):
    rows = list(db.scalars(
        select(ConjugateChemistry).order_by(ConjugateChemistry.sort_order)
    ).all())
    return _json_download({
        "version": 1,
        "resource": "conjugate-chemistries",
        "exported_at": _now_iso(),
        "records": [
            {"id": r.id, "name": r.name, "label": r.label, "sort_order": r.sort_order}
            for r in rows
        ],
    }, "conjugate-chemistries-export.json")


_CHEMISTRY_FIELDS = ("id", "name", "label", "sort_order")


def _chemistry_to_dict(c: ConjugateChemistry) -> dict[str, Any]:
    return {f: getattr(c, f) for f in _CHEMISTRY_FIELDS}


@router.post("/import/conjugate-chemistries/preview")
def import_conjugate_chemistries_preview(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    existing_rows = {c.id: c for c in db.scalars(select(ConjugateChemistry)).all()}
    return {
        "resource": "conjugate-chemistries",
        **_preview_generic(records, existing_rows, _CHEMISTRY_FIELDS, _chemistry_to_dict),
    }


@router.post("/import/conjugate-chemistries/commit")
def import_conjugate_chemistries_commit(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    allowed = set(_CHEMISTRY_FIELDS)
    for raw in records:
        clean, _ = _sanitize_generic(dict(raw), allowed)
        if not clean.get("id"):
            continue
        db.merge(ConjugateChemistry(**clean))
    db.commit()
    return {"imported": len(records)}


# Legacy endpoint retained for non-diff callers.
@router.post("/import/conjugate-chemistries")
def import_conjugate_chemistries(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    return import_conjugate_chemistries_commit(payload=payload, db=db)


# ── FLOW PANELS ───────────────────────────────────────────────────────────────

@router.get("/export/flow-panels")
def export_flow_panels(db: Session = Depends(get_db)):
    panels = list(db.scalars(
        select(Panel).options(
            selectinload(Panel.targets),
            selectinload(Panel.assignments),
        )
    ).all())
    return _json_download({
        "version": 1,
        "resource": "flow-panels",
        "exported_at": _now_iso(),
        "records": [
            {
                "id": p.id, "name": p.name, "instrument_id": p.instrument_id,
                "targets": [
                    {
                        "id": t.id, "antibody_id": t.antibody_id,
                        "dye_label_id": t.dye_label_id,
                        "staining_mode": t.staining_mode,
                        "secondary_antibody_id": t.secondary_antibody_id,
                        "sort_order": t.sort_order,
                    }
                    for t in sorted(p.targets, key=lambda x: x.sort_order)
                ],
                "assignments": [
                    {
                        "id": a.id, "antibody_id": a.antibody_id,
                        "dye_label_id": a.dye_label_id,
                        "fluorophore_id": a.fluorophore_id,
                        "detector_id": a.detector_id, "notes": a.notes,
                    }
                    for a in p.assignments
                ],
            }
            for p in panels
        ],
    }, "flow-panels-export.json")


_FLOW_PANEL_FIELDS = ("id", "name", "instrument_id")
_FLOW_TARGET_FIELDS = (
    "id", "antibody_id", "dye_label_id", "staining_mode", "secondary_antibody_id", "sort_order",
)
_FLOW_ASSIGNMENT_FIELDS = (
    "id", "antibody_id", "dye_label_id", "fluorophore_id", "detector_id", "notes",
)


def _flow_panel_to_dict(p: Panel) -> dict[str, Any]:
    return {
        "id": p.id,
        "name": p.name,
        "instrument_id": p.instrument_id,
        "targets": [
            {
                "id": t.id,
                "antibody_id": t.antibody_id,
                "dye_label_id": t.dye_label_id,
                "staining_mode": t.staining_mode,
                "secondary_antibody_id": t.secondary_antibody_id,
                "sort_order": t.sort_order,
            }
            for t in sorted(p.targets, key=lambda x: x.sort_order)
        ],
        "assignments": [
            {
                "id": a.id,
                "antibody_id": a.antibody_id,
                "dye_label_id": a.dye_label_id,
                "fluorophore_id": a.fluorophore_id,
                "detector_id": a.detector_id,
                "notes": a.notes,
            }
            for a in sorted(p.assignments, key=lambda x: x.id)
        ],
    }


_FLOW_PANEL_PREVIEW_FIELDS = _FLOW_PANEL_FIELDS + ("targets", "assignments")


@router.post("/import/flow-panels/preview")
def import_flow_panels_preview(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    existing_rows = {
        p.id: p
        for p in db.scalars(
            select(Panel).options(
                selectinload(Panel.targets),
                selectinload(Panel.assignments),
            )
        ).all()
    }
    normalized = []
    for raw in records:
        rec = dict(raw)
        rec["targets"] = sorted(
            [dict(t) for t in (rec.get("targets") or [])],
            key=lambda t: t.get("sort_order") or 0,
        )
        rec["assignments"] = sorted(
            [dict(a) for a in (rec.get("assignments") or [])],
            key=lambda a: str(a.get("id") or ""),
        )
        normalized.append(rec)
    result = _preview_generic(
        normalized, existing_rows, _FLOW_PANEL_PREVIEW_FIELDS, _flow_panel_to_dict
    )
    return {"resource": "flow-panels", **result}


@router.post("/import/flow-panels/commit")
def import_flow_panels_commit(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    existing_instruments = set(db.scalars(select(Instrument.id)).all())
    existing_antibodies = set(db.scalars(select(Antibody.id)).all())
    existing_fluors = set(db.scalars(select(Fluorophore.id)).all())
    existing_detectors = set(db.scalars(select(Detector.id)).all())
    existing_secondaries = set(db.scalars(select(SecondaryAntibody.id)).all())
    existing_dye_labels = set(db.scalars(select(DyeLabel.id)).all())

    nulled_instruments = 0
    skipped_assignments = 0
    nulled_secondaries = 0
    nulled_target_antibodies = 0
    nulled_dye_labels = 0

    for rec in records:
        rec = dict(rec)
        targets = rec.pop("targets", []) or []
        assignments = rec.pop("assignments", []) or []
        rec.pop("created_at", None); rec.pop("updated_at", None)
        parent_clean, _ = _sanitize_generic(rec, set(_FLOW_PANEL_FIELDS))
        if not parent_clean.get("id"):
            continue
        if parent_clean.get("instrument_id") and parent_clean["instrument_id"] not in existing_instruments:
            parent_clean["instrument_id"] = None
            nulled_instruments += 1
        db.merge(Panel(**parent_clean))
        db.flush()
        # Wipe existing children (cascade handles it, but explicit delete is safer in case of stale session).
        db.execute(PanelAssignment.__table__.delete().where(PanelAssignment.panel_id == parent_clean["id"]))
        db.execute(PanelTarget.__table__.delete().where(PanelTarget.panel_id == parent_clean["id"]))
        db.flush()

        for t in targets:
            t = dict(t)
            t_clean, _ = _sanitize_generic(t, set(_FLOW_TARGET_FIELDS))
            if not t_clean.get("id"):
                continue
            if t_clean.get("antibody_id") and t_clean["antibody_id"] not in existing_antibodies:
                t_clean["antibody_id"] = None
                nulled_target_antibodies += 1
            if t_clean.get("secondary_antibody_id") and t_clean["secondary_antibody_id"] not in existing_secondaries:
                t_clean["secondary_antibody_id"] = None
                nulled_secondaries += 1
            if t_clean.get("dye_label_id") and t_clean["dye_label_id"] not in existing_dye_labels:
                t_clean["dye_label_id"] = None
                nulled_dye_labels += 1
            t_clean["panel_id"] = parent_clean["id"]
            db.merge(PanelTarget(**t_clean))

        for a in assignments:
            a = dict(a)
            a_clean, _ = _sanitize_generic(a, set(_FLOW_ASSIGNMENT_FIELDS))
            if not a_clean.get("id"):
                skipped_assignments += 1
                continue
            # Hard FKs: must exist or skip the row.
            if a_clean.get("fluorophore_id") not in existing_fluors or a_clean.get("detector_id") not in existing_detectors:
                skipped_assignments += 1
                continue
            if a_clean.get("antibody_id") and a_clean["antibody_id"] not in existing_antibodies:
                a_clean["antibody_id"] = None
            if a_clean.get("dye_label_id") and a_clean["dye_label_id"] not in existing_dye_labels:
                a_clean["dye_label_id"] = None
                nulled_dye_labels += 1
            a_clean["panel_id"] = parent_clean["id"]
            db.merge(PanelAssignment(**a_clean))
    db.commit()
    return {
        "imported": len(records),
        "nulled_instrument_refs": nulled_instruments,
        "skipped_assignments": skipped_assignments,
        "nulled_secondary_refs": nulled_secondaries,
        "nulled_target_antibody_refs": nulled_target_antibodies,
        "nulled_dye_label_refs": nulled_dye_labels,
    }


# Legacy endpoint retained for non-diff callers.
@router.post("/import/flow-panels")
def import_flow_panels(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    return import_flow_panels_commit(payload=payload, db=db)


# ── IF PANELS ─────────────────────────────────────────────────────────────────

@router.get("/export/if-panels")
def export_if_panels(db: Session = Depends(get_db)):
    panels = list(db.scalars(
        select(IFPanel).options(
            selectinload(IFPanel.targets),
            selectinload(IFPanel.assignments),
        )
    ).all())
    return _json_download({
        "version": 1,
        "resource": "if-panels",
        "exported_at": _now_iso(),
        "records": [
            {
                "id": p.id, "name": p.name, "panel_type": p.panel_type,
                "microscope_id": p.microscope_id, "view_mode": p.view_mode,
                "targets": [
                    {
                        "id": t.id, "antibody_id": t.antibody_id,
                        "dye_label_id": t.dye_label_id,
                        "staining_mode": t.staining_mode,
                        "secondary_antibody_id": t.secondary_antibody_id,
                        "sort_order": t.sort_order,
                        "dilution_override": t.dilution_override,
                    }
                    for t in sorted(p.targets, key=lambda x: x.sort_order)
                ],
                "assignments": [
                    {
                        "id": a.id, "antibody_id": a.antibody_id,
                        "dye_label_id": a.dye_label_id,
                        "fluorophore_id": a.fluorophore_id,
                        "filter_id": a.filter_id, "notes": a.notes,
                    }
                    for a in p.assignments
                ],
            }
            for p in panels
        ],
    }, "if-panels-export.json")


_IF_PANEL_FIELDS = ("id", "name", "panel_type", "microscope_id", "view_mode")
_IF_TARGET_FIELDS = (
    "id", "antibody_id", "dye_label_id", "staining_mode", "secondary_antibody_id",
    "sort_order", "dilution_override",
)
_IF_ASSIGNMENT_FIELDS = (
    "id", "antibody_id", "dye_label_id", "fluorophore_id", "filter_id", "notes",
)


def _if_panel_to_dict(p: IFPanel) -> dict[str, Any]:
    return {
        "id": p.id,
        "name": p.name,
        "panel_type": p.panel_type,
        "microscope_id": p.microscope_id,
        "view_mode": p.view_mode,
        "targets": [
            {
                "id": t.id,
                "antibody_id": t.antibody_id,
                "dye_label_id": t.dye_label_id,
                "staining_mode": t.staining_mode,
                "secondary_antibody_id": t.secondary_antibody_id,
                "sort_order": t.sort_order,
                "dilution_override": t.dilution_override,
            }
            for t in sorted(p.targets, key=lambda x: x.sort_order)
        ],
        "assignments": [
            {
                "id": a.id,
                "antibody_id": a.antibody_id,
                "dye_label_id": a.dye_label_id,
                "fluorophore_id": a.fluorophore_id,
                "filter_id": a.filter_id,
                "notes": a.notes,
            }
            for a in sorted(p.assignments, key=lambda x: x.id)
        ],
    }


_IF_PANEL_PREVIEW_FIELDS = _IF_PANEL_FIELDS + ("targets", "assignments")


@router.post("/import/if-panels/preview")
def import_if_panels_preview(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    existing_rows = {
        p.id: p
        for p in db.scalars(
            select(IFPanel).options(
                selectinload(IFPanel.targets),
                selectinload(IFPanel.assignments),
            )
        ).all()
    }
    normalized = []
    for raw in records:
        rec = dict(raw)
        rec["targets"] = sorted(
            [dict(t) for t in (rec.get("targets") or [])],
            key=lambda t: t.get("sort_order") or 0,
        )
        rec["assignments"] = sorted(
            [dict(a) for a in (rec.get("assignments") or [])],
            key=lambda a: str(a.get("id") or ""),
        )
        normalized.append(rec)
    result = _preview_generic(
        normalized, existing_rows, _IF_PANEL_PREVIEW_FIELDS, _if_panel_to_dict
    )
    return {"resource": "if-panels", **result}


@router.post("/import/if-panels/commit")
def import_if_panels_commit(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    existing_microscopes = set(db.scalars(select(Microscope.id)).all())
    existing_antibodies = set(db.scalars(select(Antibody.id)).all())
    existing_fluors = set(db.scalars(select(Fluorophore.id)).all())
    existing_filters = set(db.scalars(select(MicroscopeFilter.id)).all())
    existing_secondaries = set(db.scalars(select(SecondaryAntibody.id)).all())
    existing_dye_labels = set(db.scalars(select(DyeLabel.id)).all())

    nulled_microscopes = 0
    skipped_assignments = 0
    nulled_filters = 0
    nulled_secondaries = 0
    nulled_target_antibodies = 0
    nulled_dye_labels = 0

    for rec in records:
        rec = dict(rec)
        targets = rec.pop("targets", []) or []
        assignments = rec.pop("assignments", []) or []
        rec.pop("created_at", None); rec.pop("updated_at", None)
        parent_clean, _ = _sanitize_generic(rec, set(_IF_PANEL_FIELDS))
        if not parent_clean.get("id"):
            continue
        if parent_clean.get("microscope_id") and parent_clean["microscope_id"] not in existing_microscopes:
            parent_clean["microscope_id"] = None
            nulled_microscopes += 1
        db.merge(IFPanel(**parent_clean))
        db.flush()
        db.execute(IFPanelAssignment.__table__.delete().where(IFPanelAssignment.panel_id == parent_clean["id"]))
        db.execute(IFPanelTarget.__table__.delete().where(IFPanelTarget.panel_id == parent_clean["id"]))
        db.flush()

        for t in targets:
            t = dict(t)
            t_clean, _ = _sanitize_generic(t, set(_IF_TARGET_FIELDS))
            if not t_clean.get("id"):
                continue
            if t_clean.get("antibody_id") and t_clean["antibody_id"] not in existing_antibodies:
                t_clean["antibody_id"] = None
                nulled_target_antibodies += 1
            if t_clean.get("secondary_antibody_id") and t_clean["secondary_antibody_id"] not in existing_secondaries:
                t_clean["secondary_antibody_id"] = None
                nulled_secondaries += 1
            if t_clean.get("dye_label_id") and t_clean["dye_label_id"] not in existing_dye_labels:
                t_clean["dye_label_id"] = None
                nulled_dye_labels += 1
            t_clean["panel_id"] = parent_clean["id"]
            db.merge(IFPanelTarget(**t_clean))

        for a in assignments:
            a = dict(a)
            a_clean, _ = _sanitize_generic(a, set(_IF_ASSIGNMENT_FIELDS))
            if not a_clean.get("id"):
                skipped_assignments += 1
                continue
            # fluorophore_id is required; filter_id is nullable.
            if a_clean.get("fluorophore_id") not in existing_fluors:
                skipped_assignments += 1
                continue
            if a_clean.get("filter_id") and a_clean["filter_id"] not in existing_filters:
                a_clean["filter_id"] = None
                nulled_filters += 1
            if a_clean.get("antibody_id") and a_clean["antibody_id"] not in existing_antibodies:
                a_clean["antibody_id"] = None
            if a_clean.get("dye_label_id") and a_clean["dye_label_id"] not in existing_dye_labels:
                a_clean["dye_label_id"] = None
                nulled_dye_labels += 1
            a_clean["panel_id"] = parent_clean["id"]
            db.merge(IFPanelAssignment(**a_clean))
    db.commit()
    return {
        "imported": len(records),
        "nulled_microscope_refs": nulled_microscopes,
        "skipped_assignments": skipped_assignments,
        "nulled_filter_refs": nulled_filters,
        "nulled_secondary_refs": nulled_secondaries,
        "nulled_target_antibody_refs": nulled_target_antibodies,
        "nulled_dye_label_refs": nulled_dye_labels,
    }


# Legacy endpoint retained for non-diff callers.
@router.post("/import/if-panels")
def import_if_panels(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    return import_if_panels_commit(payload=payload, db=db)


# ── DYE LABELS ────────────────────────────────────────────────────────────────

@router.get("/export/dye-labels")
def export_dye_labels(db: Session = Depends(get_db)):
    rows = list(db.scalars(select(DyeLabel)).all())
    return _json_download({
        "version": 1,
        "resource": "dye-labels",
        "exported_at": _now_iso(),
        "records": [
            {
                "id": r.id, "name": r.name, "label_target": r.label_target,
                "category": r.category, "fluorophore_id": r.fluorophore_id,
                "vendor": r.vendor, "catalog_number": r.catalog_number,
                "lot_number": r.lot_number,
                "flow_dilution": r.flow_dilution, "icc_if_dilution": r.icc_if_dilution,
                "flow_dilution_factor": r.flow_dilution_factor,
                "icc_if_dilution_factor": r.icc_if_dilution_factor,
                "notes": r.notes, "is_favorite": r.is_favorite,
            }
            for r in rows
        ],
    }, "dye-labels-export.json")


_DYE_LABEL_FIELDS = (
    "id", "name", "label_target", "category", "fluorophore_id",
    "vendor", "catalog_number", "lot_number",
    "flow_dilution", "icc_if_dilution",
    "flow_dilution_factor", "icc_if_dilution_factor",
    "notes", "is_favorite",
)


def _dye_label_to_dict(r: DyeLabel) -> dict[str, Any]:
    return {f: getattr(r, f) for f in _DYE_LABEL_FIELDS}


@router.post("/import/dye-labels/preview")
def import_dye_labels_preview(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    existing_rows = {r.id: r for r in db.scalars(select(DyeLabel)).all()}
    return {
        "resource": "dye-labels",
        **_preview_generic(records, existing_rows, _DYE_LABEL_FIELDS, _dye_label_to_dict),
    }


@router.post("/import/dye-labels/commit")
def import_dye_labels_commit(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    existing_fluor_ids = set(db.scalars(select(Fluorophore.id)).all())
    nulled_fluorophores = 0
    allowed = set(_DYE_LABEL_FIELDS)
    try:
        for raw in records:
            clean, _ = _sanitize_generic(dict(raw), allowed)
            if not clean.get("id"):
                continue
            if clean.get("fluorophore_id") and clean["fluorophore_id"] not in existing_fluor_ids:
                clean["fluorophore_id"] = None
                nulled_fluorophores += 1
            if clean.get("name") is None:
                clean["name"] = ""
            if clean.get("label_target") is None:
                clean["label_target"] = ""
            db.merge(DyeLabel(**clean))
        db.commit()
        return {
            "imported": len(records),
            "nulled_fluorophore_refs": nulled_fluorophores,
        }
    except Exception as e:
        db.rollback()
        logger.exception("dye-labels import commit failed")
        raise HTTPException(status_code=422, detail=str(e)) from e


# Legacy endpoint retained for non-diff callers.
@router.post("/import/dye-labels")
def import_dye_labels(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    return import_dye_labels_commit(payload=payload, db=db)


# ── PLATE MAPS ────────────────────────────────────────────────────────────────

@router.get("/export/plate-maps")
def export_plate_maps(db: Session = Depends(get_db)):
    rows = list(db.scalars(select(PlateMap)).all())
    return _json_download({
        "version": 1,
        "resource": "plate-maps",
        "exported_at": _now_iso(),
        "records": [
            {
                "id": r.id, "name": r.name, "description": r.description,
                "plate_type": r.plate_type, "well_data": r.well_data, "legend": r.legend,
            }
            for r in rows
        ],
    }, "plate-maps-export.json")


_PLATE_MAP_FIELDS = ("id", "name", "description", "plate_type", "well_data", "legend")


def _plate_map_to_dict(r: PlateMap) -> dict[str, Any]:
    return {f: getattr(r, f) for f in _PLATE_MAP_FIELDS}


@router.post("/import/plate-maps/preview")
def import_plate_maps_preview(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    existing_rows = {r.id: r for r in db.scalars(select(PlateMap)).all()}
    return {
        "resource": "plate-maps",
        **_preview_generic(records, existing_rows, _PLATE_MAP_FIELDS, _plate_map_to_dict),
    }


@router.post("/import/plate-maps/commit")
def import_plate_maps_commit(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    allowed = set(_PLATE_MAP_FIELDS)
    try:
        for raw in records:
            clean, _ = _sanitize_generic(dict(raw), allowed)
            if not clean.get("id"):
                continue
            if clean.get("name") is None:
                clean["name"] = ""
            if clean.get("plate_type") is None:
                clean["plate_type"] = "96-well"
            if clean.get("well_data") is None:
                clean["well_data"] = "{}"
            if clean.get("legend") is None:
                clean["legend"] = "{}"
            db.merge(PlateMap(**clean))
        db.commit()
        return {"imported": len(records)}
    except Exception as e:
        db.rollback()
        logger.exception("plate-maps import commit failed")
        raise HTTPException(status_code=422, detail=str(e)) from e


# Legacy endpoint retained for non-diff callers.
@router.post("/import/plate-maps")
def import_plate_maps(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    return import_plate_maps_commit(payload=payload, db=db)


# ── EXPERIMENTS ───────────────────────────────────────────────────────────────

@router.get("/export/experiments")
def export_experiments(db: Session = Depends(get_db)):
    experiments = list(db.scalars(
        select(Experiment).options(selectinload(Experiment.blocks))
    ).all())
    return _json_download({
        "version": 1,
        "resource": "experiments",
        "exported_at": _now_iso(),
        "records": [
            {
                "id": e.id, "name": e.name, "description": e.description,
                "blocks": [
                    {
                        "id": b.id, "block_type": b.block_type, "content": b.content,
                        "sort_order": b.sort_order, "parent_id": b.parent_id,
                    }
                    for b in sorted(e.blocks, key=lambda x: x.sort_order)
                ],
            }
            for e in experiments
        ],
    }, "experiments-export.json")


_EXPERIMENT_FIELDS = ("id", "name", "description")
_BLOCK_FIELDS = ("id", "block_type", "content", "sort_order", "parent_id")
_EXPERIMENT_PREVIEW_FIELDS = _EXPERIMENT_FIELDS + ("blocks",)


def _experiment_to_dict(e: Experiment) -> dict[str, Any]:
    return {
        "id": e.id,
        "name": e.name,
        "description": e.description,
        "blocks": [
            {
                "id": b.id,
                "block_type": b.block_type,
                "content": b.content,
                "sort_order": b.sort_order,
                "parent_id": b.parent_id,
            }
            for b in sorted(e.blocks, key=lambda x: x.sort_order)
        ],
    }


@router.post("/import/experiments/preview")
def import_experiments_preview(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    existing_rows = {
        e.id: e
        for e in db.scalars(
            select(Experiment).options(selectinload(Experiment.blocks))
        ).all()
    }
    normalized = []
    for raw in records:
        rec = dict(raw)
        rec["blocks"] = sorted(
            [dict(b) for b in (rec.get("blocks") or [])],
            key=lambda b: b.get("sort_order") or 0,
        )
        normalized.append(rec)
    result = _preview_generic(
        normalized, existing_rows, _EXPERIMENT_PREVIEW_FIELDS, _experiment_to_dict
    )
    return {"resource": "experiments", **result}


@router.post("/import/experiments/commit")
def import_experiments_commit(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", []) or []
    allowed_exp = set(_EXPERIMENT_FIELDS)
    allowed_block = set(_BLOCK_FIELDS)

    try:
        for rec in records:
            rec = dict(rec)
            blocks = rec.pop("blocks", []) or []
            rec.pop("created_at", None); rec.pop("updated_at", None)
            exp_clean, _ = _sanitize_generic(rec, allowed_exp)
            if not exp_clean.get("id"):
                continue
            if exp_clean.get("name") is None:
                exp_clean["name"] = ""
            db.merge(Experiment(**exp_clean))
            db.flush()
            db.execute(
                ExperimentBlock.__table__.delete().where(
                    ExperimentBlock.experiment_id == exp_clean["id"]
                )
            )
            db.flush()

            # Two-pass insert: top-level blocks first, then children.
            # This satisfies the self-referential parent_id FK constraint.
            top_level = [b for b in blocks if not b.get("parent_id")]
            nested = [b for b in blocks if b.get("parent_id")]

            for b in top_level + nested:
                b = dict(b)
                b.pop("created_at", None); b.pop("updated_at", None)
                b_clean, _ = _sanitize_generic(b, allowed_block)
                if not b_clean.get("id"):
                    continue
                if b_clean.get("sort_order") is None:
                    b_clean["sort_order"] = 0.0
                if b_clean.get("content") is None:
                    b_clean["content"] = "{}"
                b_clean["experiment_id"] = exp_clean["id"]
                db.merge(ExperimentBlock(**b_clean))

        db.commit()
        return {"imported": len(records)}
    except Exception as e:
        db.rollback()
        logger.exception("experiments import commit failed")
        raise HTTPException(status_code=422, detail=str(e)) from e


# Legacy endpoint retained for non-diff callers.
@router.post("/import/experiments")
def import_experiments(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    return import_experiments_commit(payload=payload, db=db)
