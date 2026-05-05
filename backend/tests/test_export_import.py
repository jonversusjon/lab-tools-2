from __future__ import annotations

import json
from typing import Any

import pytest
from sqlalchemy import select

from models import ConjugateChemistry
from models import IFPanel
from models import Instrument
from models import ListEntry
from models import Microscope
from models import MicroscopeFilter
from models import MicroscopeLaser
from models import Panel


# ── helpers ───────────────────────────────────────────────────────────────────

def _post_json(client, url: str, body: dict[str, Any]):
    return client.post(url, json=body)


# ── microscope export round-trip ──────────────────────────────────────────────

def test_microscope_export_includes_excitation_fields(client, db_session):
    """GET /export/microscopes must include excitation_type and ex_filter_width for each laser."""
    microscope = Microscope(id="test-mscope-1", name="Test Confocal")
    db_session.add(microscope)
    db_session.flush()

    laser = MicroscopeLaser(
        id="test-ml-1",
        microscope_id=microscope.id,
        wavelength_nm=488,
        name="488nm",
        excitation_type="lamp",
        ex_filter_width=20,
    )
    db_session.add(laser)

    filt = MicroscopeFilter(
        id="test-mf-1",
        laser_id=laser.id,
        filter_midpoint=530,
        filter_width=30,
        name="530/30",
    )
    db_session.add(filt)
    db_session.commit()

    resp = client.get("/api/v1/export/microscopes")
    assert resp.status_code == 200

    data = json.loads(resp.content)
    records = data["records"]
    m = next(r for r in records if r["id"] == "test-mscope-1")
    assert len(m["lasers"]) == 1
    laser_row = m["lasers"][0]

    assert laser_row["excitation_type"] == "lamp", "excitation_type must be in export"
    assert laser_row["ex_filter_width"] == 20, "ex_filter_width must be in export"


def test_microscope_export_round_trip(client, db_session):
    """Export → delete → import preserves excitation_type and ex_filter_width."""
    # Create microscope with non-default excitation fields
    microscope = Microscope(id="test-mscope-rt", name="Round-trip Scope")
    db_session.add(microscope)
    db_session.flush()
    laser = MicroscopeLaser(
        id="test-ml-rt",
        microscope_id=microscope.id,
        wavelength_nm=561,
        name="561nm",
        excitation_type="lamp",
        ex_filter_width=15,
    )
    db_session.add(laser)
    db_session.commit()

    # Export
    export_resp = client.get("/api/v1/export/microscopes")
    assert export_resp.status_code == 200
    export_data = json.loads(export_resp.content)

    # Delete from DB (cascade removes the laser)
    db_session.delete(db_session.get(Microscope, "test-mscope-rt"))
    db_session.commit()

    # Import
    records = [r for r in export_data["records"] if r["id"] == "test-mscope-rt"]
    assert len(records) == 1
    import_resp = client.post("/api/v1/import/microscopes/commit", json={"records": records})
    assert import_resp.status_code == 200

    # Re-fetch and verify
    db_session.expire_all()
    restored_laser = db_session.get(MicroscopeLaser, "test-ml-rt")
    assert restored_laser is not None
    assert restored_laser.excitation_type == "lamp"
    assert restored_laser.ex_filter_width == 15


# ── import atomicity tests ─────────────────────────────────────────────────────

def test_import_instruments_commit_rolls_back_on_error(client, db_session, monkeypatch):
    """Mid-loop exception in import_instruments_commit triggers full rollback."""
    calls: list = []
    real_merge = db_session.merge

    def failing_merge(instance):
        calls.append(instance)
        if len(calls) >= 2:
            raise Exception("Injected failure on second merge")
        return real_merge(instance)

    monkeypatch.setattr(db_session, "merge", failing_merge)

    payload = {
        "records": [
            {
                "id": "inst-rollback-1",
                "name": "First Instrument",
                "is_favorite": False,
                "location": None,
                "lasers": [],
            },
            {
                "id": "inst-rollback-2",
                "name": "Second Instrument",
                "is_favorite": False,
                "location": None,
                "lasers": [],
            },
        ]
    }

    resp = client.post("/api/v1/import/instruments/commit", json=payload)
    assert resp.status_code == 422

    db_session.expire_all()
    result = db_session.scalar(select(Instrument).where(Instrument.id == "inst-rollback-1"))
    assert result is None, "first record must be rolled back on exception"


def test_import_microscopes_commit_rolls_back_on_error(client, db_session, monkeypatch):
    """Mid-loop exception in import_microscopes_commit triggers full rollback."""
    calls: list = []
    real_merge = db_session.merge

    def failing_merge(instance):
        calls.append(instance)
        if len(calls) >= 2:
            raise Exception("Injected failure on second merge")
        return real_merge(instance)

    monkeypatch.setattr(db_session, "merge", failing_merge)

    payload = {
        "records": [
            {
                "id": "mscope-rollback-1",
                "name": "First Scope",
                "is_favorite": False,
                "location": None,
                "lasers": [],
            },
            {
                "id": "mscope-rollback-2",
                "name": "Second Scope",
                "is_favorite": False,
                "location": None,
                "lasers": [],
            },
        ]
    }

    resp = client.post("/api/v1/import/microscopes/commit", json=payload)
    assert resp.status_code == 422

    db_session.expire_all()
    result = db_session.scalar(select(Microscope).where(Microscope.id == "mscope-rollback-1"))
    assert result is None, "first record must be rolled back on exception"


def test_import_list_entries_commit_rolls_back_on_error(client, db_session, monkeypatch):
    """Mid-loop exception in import_list_entries_commit triggers full rollback."""
    calls: list = []
    real_merge = db_session.merge

    def failing_merge(instance):
        calls.append(instance)
        if len(calls) >= 2:
            raise Exception("Injected failure on second merge")
        return real_merge(instance)

    monkeypatch.setattr(db_session, "merge", failing_merge)

    payload = {
        "records": [
            {"id": "le-rollback-1", "list_type": "host", "value": "Duck", "sort_order": 99},
            {"id": "le-rollback-2", "list_type": "host", "value": "Goose", "sort_order": 100},
        ]
    }

    resp = client.post("/api/v1/import/list-entries/commit", json=payload)
    assert resp.status_code == 422

    db_session.expire_all()
    result = db_session.scalar(select(ListEntry).where(ListEntry.id == "le-rollback-1"))
    assert result is None, "first record must be rolled back on exception"


def test_import_conjugate_chemistries_commit_rolls_back_on_error(client, db_session, monkeypatch):
    """Mid-loop exception in import_conjugate_chemistries_commit triggers full rollback."""
    calls: list = []
    real_merge = db_session.merge

    def failing_merge(instance):
        calls.append(instance)
        if len(calls) >= 2:
            raise Exception("Injected failure on second merge")
        return real_merge(instance)

    monkeypatch.setattr(db_session, "merge", failing_merge)

    payload = {
        "records": [
            {"id": "cc-rollback-1", "name": "biotin-x", "label": "Anti-Biotin-X", "sort_order": 99},
            {"id": "cc-rollback-2", "name": "dig-x", "label": "Anti-DIG-X", "sort_order": 100},
        ]
    }

    resp = client.post("/api/v1/import/conjugate-chemistries/commit", json=payload)
    assert resp.status_code == 422

    db_session.expire_all()
    result = db_session.scalar(
        select(ConjugateChemistry).where(ConjugateChemistry.id == "cc-rollback-1")
    )
    assert result is None, "first record must be rolled back on exception"


def test_import_flow_panels_commit_rolls_back_on_error(client, db_session, monkeypatch):
    """Mid-loop exception in import_flow_panels_commit triggers full rollback."""
    calls: list = []
    real_merge = db_session.merge

    def failing_merge(instance):
        calls.append(instance)
        if len(calls) >= 2:
            raise Exception("Injected failure on second merge")
        return real_merge(instance)

    monkeypatch.setattr(db_session, "merge", failing_merge)

    payload = {
        "records": [
            {"id": "fp-rollback-1", "name": "First Flow Panel", "targets": [], "assignments": []},
            {"id": "fp-rollback-2", "name": "Second Flow Panel", "targets": [], "assignments": []},
        ]
    }

    resp = client.post("/api/v1/import/flow-panels/commit", json=payload)
    assert resp.status_code == 422

    db_session.expire_all()
    result = db_session.scalar(select(Panel).where(Panel.id == "fp-rollback-1"))
    assert result is None, "first record must be rolled back on exception"


def test_import_if_panels_commit_rolls_back_on_error(client, db_session, monkeypatch):
    """Mid-loop exception in import_if_panels_commit triggers full rollback."""
    calls: list = []
    real_merge = db_session.merge

    def failing_merge(instance):
        calls.append(instance)
        if len(calls) >= 2:
            raise Exception("Injected failure on second merge")
        return real_merge(instance)

    monkeypatch.setattr(db_session, "merge", failing_merge)

    payload = {
        "records": [
            {"id": "ifp-rollback-1", "name": "First IF Panel", "targets": [], "assignments": []},
            {"id": "ifp-rollback-2", "name": "Second IF Panel", "targets": [], "assignments": []},
        ]
    }

    resp = client.post("/api/v1/import/if-panels/commit", json=payload)
    assert resp.status_code == 422

    db_session.expire_all()
    result = db_session.scalar(select(IFPanel).where(IFPanel.id == "ifp-rollback-1"))
    assert result is None, "first record must be rolled back on exception"
