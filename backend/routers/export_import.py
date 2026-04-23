from __future__ import annotations

import json
from datetime import datetime
from datetime import timezone
from typing import Any

from fastapi import APIRouter
from fastapi import Body
from fastapi import Depends
from fastapi import Response
from sqlalchemy import select
from sqlalchemy.orm import Session
from sqlalchemy.orm import selectinload

from database import get_db
from models import Antibody
from models import AntibodyTag
from models import AntibodyTagAssignment
from models import ConjugateChemistry
from models import Detector
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
    """Strip unknown keys from an imported record, return (clean_record, dropped_keys)."""
    allowed = set(_ANTIBODY_FIELDS) | {"tag_ids"}
    dropped = sorted(k for k in rec.keys() if k not in allowed and k not in ("created_at", "updated_at"))
    clean = {k: rec[k] for k in rec.keys() if k in allowed}
    # Normalize tag_ids list so it round-trips through sorting
    clean["tag_ids"] = sorted(clean.get("tag_ids") or [])
    return clean, dropped


def _diff_fields(existing: dict[str, Any], imported: dict[str, Any]) -> list[str]:
    """Return sorted list of field names that differ between the two dicts (across union of keys)."""
    keys = set(existing.keys()) | set(imported.keys())
    diffs: list[str] = []
    for k in keys:
        a = existing.get(k)
        b = imported.get(k)
        if isinstance(a, list) and isinstance(b, list):
            if sorted(a) != sorted(b):
                diffs.append(k)
        elif a != b:
            diffs.append(k)
    return sorted(diffs)


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

    new_items: list[dict[str, Any]] = []
    conflicts: list[dict[str, Any]] = []
    all_dropped_keys: set[str] = set()
    all_present_keys: set[str] = set()

    for raw in records:
        clean, dropped = _sanitize_imported_antibody(dict(raw))
        all_dropped_keys.update(dropped)
        all_present_keys.update(k for k in raw.keys() if k not in ("created_at", "updated_at"))

        rec_id = clean.get("id")
        if rec_id and rec_id in existing_rows:
            existing_dict = _antibody_to_dict(existing_rows[rec_id])
            diff = _diff_fields(existing_dict, clean)
            if diff:
                conflicts.append({
                    "id": rec_id,
                    "existing": existing_dict,
                    "imported": clean,
                    "diff_fields": diff,
                })
            # If no diff → identical, silently skip.
        else:
            new_items.append(clean)

    # db_only_props: fields the DB has that NO imported record carried
    # (indicates the user is importing an old export into a newer schema)
    db_only_props = sorted(f for f in _ANTIBODY_FIELDS if f not in all_present_keys and f != "id")
    # import_only_props: extra keys in the import that don't map to our schema
    import_only_props = sorted(all_dropped_keys)

    # Tags: merge-only for Phase 1. Report which tags are new vs already-known.
    new_tags = []
    for t in tags_payload:
        if t.get("id") and t["id"] not in existing_tags:
            new_tags.append(t)

    return {
        "resource": "antibodies",
        "new_items": new_items,
        "conflicts": conflicts,
        "db_only_props": db_only_props,
        "import_only_props": import_only_props,
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

    for t in tags_payload:
        if not t.get("id") or not t.get("name"):
            continue
        db.merge(AntibodyTag(id=t["id"], name=t["name"], color=t.get("color")))
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
            if tag_id not in existing_tag_ids:
                skipped_tag_refs += 1
                continue
            db.merge(AntibodyTagAssignment(antibody_id=clean["id"], tag_id=tag_id))

    db.commit()
    return {
        "imported": len(records),
        "tags_imported": len(tags_payload),
        "nulled_fluorophore_refs": nulled_fluorophores,
        "skipped_tag_refs": skipped_tag_refs,
    }


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


@router.post("/import/secondaries")
def import_secondaries(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", [])
    existing_fluor_ids = set(db.scalars(select(Fluorophore.id)).all())
    nulled_fluorophores = 0
    for rec in records:
        for f in ("created_at", "updated_at"):
            rec.pop(f, None)
        if rec.get("fluorophore_id") and rec["fluorophore_id"] not in existing_fluor_ids:
            rec["fluorophore_id"] = None
            nulled_fluorophores += 1
        db.merge(SecondaryAntibody(**rec))
    db.commit()
    return {
        "imported": len(records),
        "nulled_fluorophore_refs": nulled_fluorophores,
    }


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


@router.post("/import/instruments")
def import_instruments(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", [])
    for rec in records:
        lasers = rec.pop("lasers", [])
        db.merge(Instrument(**rec))
        db.flush()
        for l in lasers:
            detectors = l.pop("detectors", [])
            db.merge(Laser(instrument_id=rec["id"], **l))
            db.flush()
            for d in detectors:
                db.merge(Detector(laser_id=l["id"], **d))
    db.commit()
    return {"imported": len(records)}


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


@router.post("/import/microscopes")
def import_microscopes(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", [])
    for rec in records:
        lasers = rec.pop("lasers", [])
        db.merge(Microscope(**rec))
        db.flush()
        for l in lasers:
            filters = l.pop("filters", [])
            db.merge(MicroscopeLaser(microscope_id=rec["id"], **l))
            db.flush()
            for f in filters:
                db.merge(MicroscopeFilter(laser_id=l["id"], **f))
    db.commit()
    return {"imported": len(records)}


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


@router.post("/import/list-entries")
def import_list_entries(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", [])
    for rec in records:
        db.merge(ListEntry(**rec))
    db.commit()
    return {"imported": len(records)}


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


@router.post("/import/conjugate-chemistries")
def import_conjugate_chemistries(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", [])
    for rec in records:
        db.merge(ConjugateChemistry(**rec))
    db.commit()
    return {"imported": len(records)}


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
                        "staining_mode": t.staining_mode,
                        "secondary_antibody_id": t.secondary_antibody_id,
                        "sort_order": t.sort_order,
                    }
                    for t in sorted(p.targets, key=lambda x: x.sort_order)
                ],
                "assignments": [
                    {
                        "id": a.id, "antibody_id": a.antibody_id,
                        "fluorophore_id": a.fluorophore_id,
                        "detector_id": a.detector_id, "notes": a.notes,
                    }
                    for a in p.assignments
                ],
            }
            for p in panels
        ],
    }, "flow-panels-export.json")


@router.post("/import/flow-panels")
def import_flow_panels(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", [])
    for rec in records:
        targets = rec.pop("targets", [])
        assignments = rec.pop("assignments", [])
        for f in ("created_at", "updated_at"):
            rec.pop(f, None)
        db.merge(Panel(**rec))
        db.flush()
        for t in targets:
            db.merge(PanelTarget(panel_id=rec["id"], **t))
        for a in assignments:
            db.merge(PanelAssignment(panel_id=rec["id"], **a))
    db.commit()
    return {"imported": len(records)}


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
                        "fluorophore_id": a.fluorophore_id,
                        "filter_id": a.filter_id, "notes": a.notes,
                    }
                    for a in p.assignments
                ],
            }
            for p in panels
        ],
    }, "if-panels-export.json")


@router.post("/import/if-panels")
def import_if_panels(
    payload: dict[str, Any] = Body(...),
    db: Session = Depends(get_db),
):
    records = payload.get("records", [])
    for rec in records:
        targets = rec.pop("targets", [])
        assignments = rec.pop("assignments", [])
        for f in ("created_at", "updated_at"):
            rec.pop(f, None)
        db.merge(IFPanel(**rec))
        db.flush()
        for t in targets:
            db.merge(IFPanelTarget(panel_id=rec["id"], **t))
        for a in assignments:
            db.merge(IFPanelAssignment(panel_id=rec["id"], **a))
    db.commit()
    return {"imported": len(records)}
