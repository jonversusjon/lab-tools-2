from __future__ import annotations

import pytest

from models import Antibody
from models import AntibodyTag
from models import AntibodyTagAssignment


def _make_record(**overrides):
    base = {
        "id": "ab-1",
        "target": "CD3",
        "name": "CD3 example",
        "clone": "UCHT1",
        "host": "Mouse",
        "isotype": "IgG1",
        "fluorophore_id": None,
        "conjugate": None,
        "vendor": "TestCo",
        "catalog_number": "TC-001",
        "confirmed_in_stock": True,
        "date_received": None,
        "flow_dilution": "1:100",
        "icc_if_dilution": None,
        "wb_dilution": None,
        "flow_dilution_factor": 100,
        "icc_if_dilution_factor": None,
        "wb_dilution_factor": None,
        "reacts_with": None,
        "storage_temp": "4C",
        "validation_notes": None,
        "notes": "seed notes",
        "website": None,
        "physical_location": None,
        "is_favorite": False,
        "tag_ids": [],
    }
    base.update(overrides)
    return base


class TestImportAntibodiesPreview:
    def test_new_items_only(self, client, db_session):
        # Delete seeded antibodies so the DB is effectively empty of matching ids
        payload = {"records": [_make_record(id="new-1")]}
        res = client.post("/api/v1/import/antibodies/preview", json=payload)
        assert res.status_code == 200
        body = res.json()
        assert body["resource"] == "antibodies"
        assert len(body["new_items"]) == 1
        assert body["new_items"][0]["id"] == "new-1"
        assert body["conflicts"] == []

    def test_conflict_detection(self, client, db_session):
        # Commit a record first
        existing = _make_record(id="conf-1", notes="original")
        client.post("/api/v1/import/antibodies/commit", json={"records": [existing]})

        # Preview a modified version
        modified = _make_record(id="conf-1", notes="different", is_favorite=True)
        res = client.post("/api/v1/import/antibodies/preview", json={"records": [modified]})
        assert res.status_code == 200
        body = res.json()
        assert body["new_items"] == []
        assert len(body["conflicts"]) == 1
        conflict = body["conflicts"][0]
        assert conflict["id"] == "conf-1"
        assert "notes" in conflict["diff_fields"]
        assert "is_favorite" in conflict["diff_fields"]
        assert conflict["existing"]["notes"] == "original"
        assert conflict["imported"]["notes"] == "different"

    def test_identical_rows_not_reported(self, client, db_session):
        # Commit, then preview same record — should show no new and no conflict
        rec = _make_record(id="same-1")
        client.post("/api/v1/import/antibodies/commit", json={"records": [rec]})
        res = client.post("/api/v1/import/antibodies/preview", json={"records": [rec]})
        assert res.status_code == 200
        body = res.json()
        assert body["new_items"] == []
        assert body["conflicts"] == []

    def test_unknown_import_fields_reported(self, client, db_session):
        payload = {
            "records": [
                {**_make_record(id="new-x"), "bogus_field": "x", "another_bogus": 1}
            ]
        }
        res = client.post("/api/v1/import/antibodies/preview", json=payload)
        body = res.json()
        assert "bogus_field" in body["import_only_props"]
        assert "another_bogus" in body["import_only_props"]

    def test_db_only_props_reported_when_import_is_minimal(self, client, db_session):
        # Import record with only id, target (missing most fields)
        payload = {"records": [{"id": "min-1", "target": "CD3"}]}
        res = client.post("/api/v1/import/antibodies/preview", json=payload)
        body = res.json()
        # Most Antibody fields should be absent from the import and thus reported
        assert "notes" in body["db_only_props"]
        assert "flow_dilution_factor" in body["db_only_props"]

    def test_preview_makes_no_writes(self, client, db_session):
        before = db_session.query(Antibody).count()
        payload = {"records": [_make_record(id="preview-only")]}
        client.post("/api/v1/import/antibodies/preview", json=payload)
        after = db_session.query(Antibody).count()
        assert before == after


class TestImportAntibodiesCommit:
    def test_empty_db_bulk_insert(self, client, db_session):
        # Clear seeded antibodies so test is clean
        db_session.query(AntibodyTagAssignment).delete()
        db_session.query(Antibody).delete()
        db_session.commit()

        payload = {
            "records": [
                _make_record(id="c-1", target="CD3", name="CD3 row", catalog_number="CAT-001"),
                _make_record(id="c-2", target="CD4", name="CD4 row", catalog_number="CAT-002"),
                _make_record(id="c-3", target="CD8", name="CD8 row", catalog_number="CAT-003"),
            ]
        }
        res = client.post("/api/v1/import/antibodies/commit", json=payload)
        assert res.status_code == 200
        body = res.json()
        assert body["imported"] == 3
        assert db_session.query(Antibody).count() == 3

    def test_commit_missing_fluorophore_fk_nulls_out(self, client, db_session):
        payload = {
            "records": [_make_record(id="fk-1", fluorophore_id="does-not-exist")]
        }
        res = client.post("/api/v1/import/antibodies/commit", json=payload)
        assert res.status_code == 200
        body = res.json()
        assert body["nulled_fluorophore_refs"] == 1
        db_session.expire_all()
        ab = db_session.query(Antibody).filter_by(id="fk-1").one()
        assert ab.fluorophore_id is None

    def test_commit_valid_fluorophore_preserved(self, client, db_session):
        payload = {
            "records": [_make_record(id="fk-2", fluorophore_id="test-egfp")]
        }
        res = client.post("/api/v1/import/antibodies/commit", json=payload)
        assert res.status_code == 200
        db_session.expire_all()
        ab = db_session.query(Antibody).filter_by(id="fk-2").one()
        assert ab.fluorophore_id == "test-egfp"

    def test_commit_tag_merge(self, client, db_session):
        payload = {
            "tags": [
                {"id": "tag-a", "name": "Panel-A", "color": "#ff0000"},
                {"id": "tag-b", "name": "Panel-B", "color": None},
            ],
            "records": [
                _make_record(id="t-1", tag_ids=["tag-a", "tag-b"]),
            ],
        }
        res = client.post("/api/v1/import/antibodies/commit", json=payload)
        assert res.status_code == 200
        db_session.expire_all()
        tag_count = db_session.query(AntibodyTag).filter(
            AntibodyTag.id.in_(["tag-a", "tag-b"])
        ).count()
        assert tag_count == 2
        assignments = (
            db_session.query(AntibodyTagAssignment)
            .filter_by(antibody_id="t-1")
            .count()
        )
        assert assignments == 2

    def test_commit_unknown_tag_ref_skipped(self, client, db_session):
        payload = {
            "records": [_make_record(id="tsk-1", tag_ids=["nonexistent-tag"])]
        }
        res = client.post("/api/v1/import/antibodies/commit", json=payload)
        body = res.json()
        assert body["skipped_tag_refs"] == 1

    def test_commit_with_unknown_fields_ignored(self, client, db_session):
        # Extra keys should be stripped rather than raise a TypeError on merge
        payload = {
            "records": [
                {**_make_record(id="u-1"), "bogus": 42, "another": "x"}
            ]
        }
        res = client.post("/api/v1/import/antibodies/commit", json=payload)
        assert res.status_code == 200
        db_session.expire_all()
        assert db_session.query(Antibody).filter_by(id="u-1").count() == 1

    def test_commit_empty_records(self, client, db_session):
        res = client.post("/api/v1/import/antibodies/commit", json={"records": []})
        assert res.status_code == 200
        assert res.json()["imported"] == 0


class TestLegacyImport:
    """The legacy /import/antibodies endpoint should still work (delegates to commit)."""

    def test_legacy_endpoint_works(self, client, db_session):
        payload = {"records": [_make_record(id="legacy-1")]}
        res = client.post("/api/v1/import/antibodies", json=payload)
        assert res.status_code == 200
        assert res.json()["imported"] == 1
