from __future__ import annotations

import json
from typing import Any

import pytest
from sqlalchemy import select

from models import ConjugateChemistry
from models import Fluorophore
from models import FluorophoreSpectrum
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


# ── fluorophore export ────────────────────────────────────────────────────────

def test_export_fluorophores_empty_db(client, db_session):
    """GET /export/fluorophores returns a valid response with correct total count."""
    resp = client.get("/api/v1/export/fluorophores")
    assert resp.status_code == 200
    data = resp.json()
    assert isinstance(data["fluorophores"], list)
    assert data["total"] == len(data["fluorophores"])
    assert "exported_at" in data


def test_export_fluorophores_includes_spectra(client, db_session):
    """Export includes inline spectra grouped by spectrum_type."""
    f = Fluorophore(id="f-spec-test", name="TestDye", source="seed", has_spectra=True, is_favorite=False)
    db_session.add(f)
    db_session.flush()
    db_session.add(FluorophoreSpectrum(fluorophore_id=f.id, spectrum_type="EX", wavelength_nm=488.0, intensity=0.9))
    db_session.add(FluorophoreSpectrum(fluorophore_id=f.id, spectrum_type="EM", wavelength_nm=530.0, intensity=1.0))
    db_session.add(FluorophoreSpectrum(fluorophore_id=f.id, spectrum_type="EM", wavelength_nm=532.0, intensity=0.8))
    db_session.commit()

    resp = client.get("/api/v1/export/fluorophores")
    assert resp.status_code == 200
    data = resp.json()
    fluors = {item["id"]: item for item in data["fluorophores"]}
    assert "f-spec-test" in fluors
    spectra = fluors["f-spec-test"]["spectra"]
    assert len(spectra["EX"]) == 1
    assert len(spectra["EM"]) == 2


def test_export_fluorophores_structure(client, db_session):
    """Response always has fluorophores, total, and exported_at fields."""
    resp = client.get("/api/v1/export/fluorophores")
    assert resp.status_code == 200
    data = resp.json()
    assert "fluorophores" in data
    assert "total" in data
    assert "exported_at" in data


# ── fluorophore import preview ────────────────────────────────────────────────

def test_preview_all_new(client, db_session):
    """Preview with 2 fluorophores not in DB shows new_count=2."""
    payload = {
        "fluorophores": [
            {"id": "f-new-1", "name": "NewDye1", "source": "seed", "has_spectra": False, "is_favorite": False, "spectra": {}},
            {"id": "f-new-2", "name": "NewDye2", "source": "seed", "has_spectra": False, "is_favorite": False, "spectra": {}},
        ]
    }
    resp = client.post("/api/v1/import/fluorophores/preview", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["new_count"] == 2
    assert data["id_conflict_count"] == 0
    assert data["name_conflict_count"] == 0


def test_preview_id_conflict(client, db_session):
    """Preview of a fluorophore whose ID already exists shows id_conflict."""
    existing = Fluorophore(id="f-existing-id", name="ExistingDye", source="seed", has_spectra=False, is_favorite=False)
    db_session.add(existing)
    db_session.commit()

    payload = {
        "fluorophores": [
            {"id": "f-existing-id", "name": "SomeName", "source": "seed", "has_spectra": False, "is_favorite": False, "spectra": {}},
        ]
    }
    resp = client.post("/api/v1/import/fluorophores/preview", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id_conflict_count"] == 1
    assert data["new_count"] == 0
    assert data["items"][0]["status"] == "id_conflict"


def test_preview_name_conflict(client, db_session):
    """Preview of a fluorophore with same name but different ID shows name_conflict."""
    existing = Fluorophore(id="f-original-id", name="SharedName", source="seed", has_spectra=False, is_favorite=False)
    db_session.add(existing)
    db_session.commit()

    payload = {
        "fluorophores": [
            {"id": "f-different-id", "name": "SharedName", "source": "seed", "has_spectra": False, "is_favorite": False, "spectra": {}},
        ]
    }
    resp = client.post("/api/v1/import/fluorophores/preview", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name_conflict_count"] == 1
    assert data["new_count"] == 0
    assert data["items"][0]["status"] == "name_conflict"


# ── fluorophore import commit ─────────────────────────────────────────────────

def test_commit_creates_fluorophores_and_spectra(client, db_session):
    """Commit inserts fluorophores and their spectrum rows."""
    payload = {
        "fluorophores": [
            {
                "id": "f-commit-1", "name": "CommitDye1", "source": "seed",
                "has_spectra": True, "is_favorite": False,
                "spectra": {"EX": [[488.0, 0.9]], "EM": [[530.0, 1.0], [532.0, 0.8]]},
            },
            {
                "id": "f-commit-2", "name": "CommitDye2", "source": "user",
                "has_spectra": False, "is_favorite": False,
                "spectra": {},
            },
        ]
    }
    resp = client.post("/api/v1/import/fluorophores/commit", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["created"] == 2
    assert data["skipped"] == 0

    db_session.expire_all()
    f1 = db_session.get(Fluorophore, "f-commit-1")
    assert f1 is not None
    assert f1.name == "CommitDye1"

    spectra_rows = db_session.scalars(
        select(FluorophoreSpectrum).where(FluorophoreSpectrum.fluorophore_id == "f-commit-1")
    ).all()
    assert len(spectra_rows) == 3


def test_commit_skips_id_conflicts(client, db_session):
    """Commit skips a fluorophore whose ID already exists; original row unchanged."""
    original = Fluorophore(id="f-skip-id", name="OriginalDye", source="seed", has_spectra=False, is_favorite=False)
    db_session.add(original)
    db_session.commit()

    payload = {
        "fluorophores": [
            {"id": "f-skip-id", "name": "OverwriteAttempt", "source": "user", "has_spectra": False, "is_favorite": True, "spectra": {}},
        ]
    }
    resp = client.post("/api/v1/import/fluorophores/commit", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["skipped"] == 1
    assert data["created"] == 0

    db_session.expire_all()
    row = db_session.get(Fluorophore, "f-skip-id")
    assert row.name == "OriginalDye", "original name must not be overwritten"


def test_commit_skips_name_conflicts(client, db_session):
    """Commit skips a fluorophore with same name but different ID."""
    original = Fluorophore(id="f-name-orig", name="NamedDye", source="seed", has_spectra=False, is_favorite=False)
    db_session.add(original)
    db_session.commit()

    payload = {
        "fluorophores": [
            {"id": "f-name-new", "name": "NamedDye", "source": "user", "has_spectra": False, "is_favorite": False, "spectra": {}},
        ]
    }
    resp = client.post("/api/v1/import/fluorophores/commit", json=payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["skipped"] == 1
    assert data["created"] == 0

    db_session.expire_all()
    rows = db_session.scalars(select(Fluorophore).where(Fluorophore.name == "NamedDye")).all()
    assert len(rows) == 1, "no duplicate name must be inserted"
    assert rows[0].id == "f-name-orig"


def test_commit_atomicity(client, db_session, monkeypatch):
    """Exception mid-import triggers rollback; no partial rows persist."""
    calls: list = []
    real_add = db_session.add

    def failing_add(instance):
        calls.append(instance)
        if len(calls) >= 2:
            raise Exception("Injected failure on second add")
        return real_add(instance)

    monkeypatch.setattr(db_session, "add", failing_add)

    payload = {
        "fluorophores": [
            {"id": "f-atomic-1", "name": "AtomicDye1", "source": "seed", "has_spectra": False, "is_favorite": False, "spectra": {}},
            {"id": "f-atomic-2", "name": "AtomicDye2", "source": "seed", "has_spectra": False, "is_favorite": False, "spectra": {}},
        ]
    }
    resp = client.post("/api/v1/import/fluorophores/commit", json=payload)
    assert resp.status_code == 422

    db_session.expire_all()
    result = db_session.scalar(select(Fluorophore).where(Fluorophore.id == "f-atomic-1"))
    assert result is None, "first record must be rolled back on exception"


# ── fluorophore round-trip ────────────────────────────────────────────────────

def test_fluorophore_export_import_round_trip(client, db_session):
    """Export → commit into fresh client → re-export; all fields and spectra match."""
    fluors = [
        Fluorophore(id="rt-f-1", name="RoundTripDye1", source="seed",
                    ex_max_nm=488.0, em_max_nm=530.0, has_spectra=True, is_favorite=True),
        Fluorophore(id="rt-f-2", name="RoundTripDye2", source="fpbase",
                    fluor_type="protein", qy=0.6, has_spectra=True, is_favorite=False),
        Fluorophore(id="rt-f-3", name="RoundTripDye3", source="user",
                    has_spectra=False, is_favorite=False),
    ]
    for f in fluors:
        db_session.add(f)
    db_session.flush()

    db_session.add(FluorophoreSpectrum(fluorophore_id="rt-f-1", spectrum_type="EX", wavelength_nm=488.0, intensity=0.9))
    db_session.add(FluorophoreSpectrum(fluorophore_id="rt-f-1", spectrum_type="EM", wavelength_nm=530.0, intensity=1.0))
    db_session.add(FluorophoreSpectrum(fluorophore_id="rt-f-2", spectrum_type="EX", wavelength_nm=400.0, intensity=0.5))
    db_session.add(FluorophoreSpectrum(fluorophore_id="rt-f-2", spectrum_type="EM", wavelength_nm=509.0, intensity=1.0))
    db_session.add(FluorophoreSpectrum(fluorophore_id="rt-f-2", spectrum_type="EM", wavelength_nm=511.0, intensity=0.9))
    db_session.commit()

    # Export from DB-A
    export_resp = client.get("/api/v1/export/fluorophores")
    assert export_resp.status_code == 200
    export_a = export_resp.json()

    # Delete all from DB-A and reimport (simulates a fresh DB)
    for f in fluors:
        db_session.delete(db_session.get(Fluorophore, f.id))
    db_session.commit()

    import_resp = client.post("/api/v1/import/fluorophores/commit", json={
        "fluorophores": [fi for fi in export_a["fluorophores"] if fi["id"].startswith("rt-f-")]
    })
    assert import_resp.status_code == 200
    assert import_resp.json()["created"] == 3

    # Re-export and compare
    export_resp2 = client.get("/api/v1/export/fluorophores")
    assert export_resp2.status_code == 200
    export_b = export_resp2.json()

    a_by_id = {f["id"]: f for f in export_a["fluorophores"] if f["id"].startswith("rt-f-")}
    b_by_id = {f["id"]: f for f in export_b["fluorophores"]}

    for fid, a_item in a_by_id.items():
        assert fid in b_by_id, "fluorophore missing after round-trip"
        b_item = b_by_id[fid]
        for field in ("name", "source", "fluor_type", "ex_max_nm", "em_max_nm",
                      "ext_coeff", "qy", "lifetime_ns", "oligomerization",
                      "switch_type", "has_spectra", "is_favorite"):
            assert a_item[field] == b_item[field], "field " + field + " mismatch for " + fid
        # Compare spectra point counts per type
        for stype, points in a_item["spectra"].items():
            assert stype in b_item["spectra"], "spectrum type " + stype + " missing after round-trip"
            assert len(points) == len(b_item["spectra"][stype]), "point count mismatch for " + stype
