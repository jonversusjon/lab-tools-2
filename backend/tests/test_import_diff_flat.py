from __future__ import annotations


# ── SECONDARIES ────────────────────────────────────────────────────────────────

def _secondary(**overrides):
    base = {
        "id": "sec-1",
        "name": "Goat anti-Mouse AF488",
        "host": "Goat",
        "target_species": "Mouse",
        "target_isotype": "IgG",
        "binding_mode": "species",
        "target_conjugate": None,
        "fluorophore_id": None,
        "vendor": "TestCo",
        "catalog_number": "SEC-001",
        "lot_number": None,
        "notes": None,
    }
    base.update(overrides)
    return base


class TestImportSecondariesPreview:
    def test_new_items_only(self, client, db_session):
        res = client.post(
            "/api/v1/import/secondaries/preview",
            json={"records": [_secondary(id="new-s1")]},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["resource"] == "secondaries"
        assert len(body["new_items"]) == 1
        assert body["conflicts"] == []

    def test_conflict_detection(self, client, db_session):
        existing = _secondary(id="sec-dup", notes="orig")
        client.post("/api/v1/import/secondaries/commit", json={"records": [existing]})
        modified = _secondary(id="sec-dup", notes="changed")
        res = client.post("/api/v1/import/secondaries/preview", json={"records": [modified]})
        body = res.json()
        assert body["new_items"] == []
        assert len(body["conflicts"]) == 1
        assert "notes" in body["conflicts"][0]["diff_fields"]

    def test_identical_skipped(self, client, db_session):
        existing = _secondary(id="sec-same")
        client.post("/api/v1/import/secondaries/commit", json={"records": [existing]})
        res = client.post("/api/v1/import/secondaries/preview", json={"records": [existing]})
        body = res.json()
        assert body["new_items"] == []
        assert body["conflicts"] == []

    def test_import_only_props_reported(self, client, db_session):
        rec = _secondary(id="sec-extra")
        rec["future_field"] = "hello"
        res = client.post("/api/v1/import/secondaries/preview", json={"records": [rec]})
        body = res.json()
        assert "future_field" in body["import_only_props"]

    def test_preview_makes_no_writes(self, client, db_session):
        rec = _secondary(id="sec-nowrite")
        client.post("/api/v1/import/secondaries/preview", json={"records": [rec]})
        # After preview only, the record shouldn't be in the DB
        # (If it were, this subsequent preview would see it as a conflict/identical, not new.)
        res = client.post("/api/v1/import/secondaries/preview", json={"records": [rec]})
        assert res.json()["new_items"][0]["id"] == "sec-nowrite"


class TestImportSecondariesCommit:
    def test_bulk_insert(self, client, db_session):
        records = [_secondary(id="s-a", name="A", catalog_number="A1"),
                   _secondary(id="s-b", name="B", catalog_number="B1")]
        res = client.post("/api/v1/import/secondaries/commit", json={"records": records})
        assert res.status_code == 200
        assert res.json()["imported"] == 2

    def test_missing_fluorophore_nulled(self, client, db_session):
        rec = _secondary(id="s-miss", fluorophore_id="does-not-exist")
        res = client.post("/api/v1/import/secondaries/commit", json={"records": [rec]})
        assert res.status_code == 200
        assert res.json()["nulled_fluorophore_refs"] == 1

    def test_unknown_fields_ignored(self, client, db_session):
        rec = _secondary(id="s-unk")
        rec["created_at"] = "2020-01-01"
        rec["phantom"] = "ignored"
        res = client.post("/api/v1/import/secondaries/commit", json={"records": [rec]})
        assert res.status_code == 200
        assert res.json()["imported"] == 1

    def test_legacy_endpoint(self, client, db_session):
        rec = _secondary(id="s-legacy")
        res = client.post("/api/v1/import/secondaries", json={"records": [rec]})
        assert res.status_code == 200


# ── LIST ENTRIES ──────────────────────────────────────────────────────────────

def _list_entry(**overrides):
    base = {"id": "le-1", "list_type": "host", "value": "Mouse", "sort_order": 0}
    base.update(overrides)
    return base


class TestImportListEntries:
    def test_preview_new(self, client, db_session):
        res = client.post(
            "/api/v1/import/list-entries/preview",
            json={"records": [_list_entry(id="le-new")]},
        )
        body = res.json()
        assert body["resource"] == "list-entries"
        assert len(body["new_items"]) == 1

    def test_preview_conflict(self, client, db_session):
        e = _list_entry(id="le-dup", value="Original")
        client.post("/api/v1/import/list-entries/commit", json={"records": [e]})
        mod = _list_entry(id="le-dup", value="Changed")
        res = client.post("/api/v1/import/list-entries/preview", json={"records": [mod]})
        body = res.json()
        assert len(body["conflicts"]) == 1
        assert "value" in body["conflicts"][0]["diff_fields"]

    def test_commit_bulk(self, client, db_session):
        # Use list_type/value combos that don't conflict with seeded data
        records = [
            _list_entry(id="le-a", list_type="isotype", value="AAA-test", sort_order=0),
            _list_entry(id="le-b", list_type="isotype", value="BBB-test", sort_order=1),
        ]
        res = client.post("/api/v1/import/list-entries/commit", json={"records": records})
        assert res.status_code == 200
        assert res.json()["imported"] == 2

    def test_legacy_endpoint(self, client, db_session):
        rec = _list_entry(id="le-legacy", list_type="isotype", value="ZZ-legacy")
        res = client.post("/api/v1/import/list-entries", json={"records": [rec]})
        assert res.status_code == 200


# ── CONJUGATE CHEMISTRIES ─────────────────────────────────────────────────────

def _chemistry(**overrides):
    base = {"id": "cc-1", "name": "biotin", "label": "Streptavidin", "sort_order": 0}
    base.update(overrides)
    return base


class TestImportConjugateChemistries:
    def test_preview_new(self, client, db_session):
        res = client.post(
            "/api/v1/import/conjugate-chemistries/preview",
            json={"records": [_chemistry(id="cc-new", name="fakelabel")]},
        )
        body = res.json()
        assert body["resource"] == "conjugate-chemistries"
        assert len(body["new_items"]) == 1

    def test_preview_conflict(self, client, db_session):
        c = _chemistry(id="cc-dup", name="dnp-test", label="Anti-DNP")
        client.post("/api/v1/import/conjugate-chemistries/commit", json={"records": [c]})
        mod = _chemistry(id="cc-dup", name="dnp-test", label="Anti-DNP Updated")
        res = client.post(
            "/api/v1/import/conjugate-chemistries/preview",
            json={"records": [mod]},
        )
        body = res.json()
        assert len(body["conflicts"]) == 1
        assert "label" in body["conflicts"][0]["diff_fields"]

    def test_commit_bulk(self, client, db_session):
        records = [
            _chemistry(id="cc-a", name="testaaa", label="Test A"),
            _chemistry(id="cc-b", name="testbbb", label="Test B"),
        ]
        res = client.post(
            "/api/v1/import/conjugate-chemistries/commit",
            json={"records": records},
        )
        assert res.status_code == 200
        assert res.json()["imported"] == 2

    def test_legacy_endpoint(self, client, db_session):
        rec = _chemistry(id="cc-legacy", name="legacy-test", label="Legacy")
        res = client.post(
            "/api/v1/import/conjugate-chemistries",
            json={"records": [rec]},
        )
        assert res.status_code == 200
