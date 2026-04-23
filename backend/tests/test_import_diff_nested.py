from __future__ import annotations


# ── INSTRUMENTS ──────────────────────────────────────────────────────────────

def _instrument(id_="inst-1", lasers=None):
    return {
        "id": id_,
        "name": "Test Cytometer",
        "is_favorite": False,
        "location": "Room 101",
        "lasers": lasers if lasers is not None else [
            {
                "id": "las-1",
                "wavelength_nm": 488,
                "name": "Blue",
                "detectors": [
                    {"id": "det-1", "filter_midpoint": 530, "filter_width": 30, "name": "FITC"},
                    {"id": "det-2", "filter_midpoint": 695, "filter_width": 40, "name": "PerCP"},
                ],
            },
        ],
    }


class TestImportInstrumentsPreview:
    def test_new_items_only(self, client, db_session):
        res = client.post(
            "/api/v1/import/instruments/preview",
            json={"records": [_instrument("inst-new")]},
        )
        assert res.status_code == 200
        body = res.json()
        assert body["resource"] == "instruments"
        assert len(body["new_items"]) == 1
        assert body["conflicts"] == []

    def test_child_change_detected_as_conflict(self, client, db_session):
        # Seed
        client.post("/api/v1/import/instruments/commit", json={"records": [_instrument("inst-c1")]})
        # Import with a different detector list (different width)
        modified = _instrument("inst-c1")
        modified["lasers"][0]["detectors"][0]["filter_width"] = 40
        res = client.post(
            "/api/v1/import/instruments/preview",
            json={"records": [modified]},
        )
        body = res.json()
        assert len(body["conflicts"]) == 1
        assert "lasers" in body["conflicts"][0]["diff_fields"]

    def test_identical_skipped(self, client, db_session):
        rec = _instrument("inst-same")
        client.post("/api/v1/import/instruments/commit", json={"records": [rec]})
        res = client.post(
            "/api/v1/import/instruments/preview", json={"records": [rec]}
        )
        body = res.json()
        assert body["new_items"] == []
        assert body["conflicts"] == []

    def test_fk_warning_when_detector_has_assignment(self, client, db_session):
        # Seed instrument + create a panel that uses the detector
        rec = _instrument("inst-fk")
        client.post("/api/v1/import/instruments/commit", json={"records": [rec]})
        # Create panel + target + assignment referencing det-1
        ab_res = client.get("/api/v1/antibodies")
        ab_id = ab_res.json()["items"][0]["id"]
        panel_res = client.post("/api/v1/panels", json={"name": "P", "instrument_id": "inst-fk"})
        panel_id = panel_res.json()["id"]
        client.post(f"/api/v1/panels/{panel_id}/targets", json={"antibody_id": ab_id})
        client.post(
            f"/api/v1/panels/{panel_id}/assignments",
            json={"antibody_id": ab_id, "fluorophore_id": "test-egfp", "detector_id": "det-1"},
        )
        # Now preview a modification
        modified = _instrument("inst-fk")
        modified["lasers"][0]["detectors"][0]["filter_width"] = 99
        res = client.post("/api/v1/import/instruments/preview", json={"records": [modified]})
        body = res.json()
        assert len(body["fk_warnings"]) == 1
        assert body["fk_warnings"][0]["id"] == "inst-fk"
        assert body["fk_warnings"][0]["assignments_at_risk"] >= 1


class TestImportInstrumentsCommit:
    def test_commit_wipes_and_replaces_children(self, client, db_session):
        # Seed with 2 detectors
        client.post("/api/v1/import/instruments/commit", json={"records": [_instrument("inst-rep")]})
        # Commit replacement with only 1 detector
        modified = _instrument("inst-rep")
        modified["lasers"][0]["detectors"] = [
            {"id": "det-1", "filter_midpoint": 530, "filter_width": 30, "name": "FITC"},
        ]
        client.post("/api/v1/import/instruments/commit", json={"records": [modified]})
        # Verify via GET
        res = client.get("/api/v1/instruments/inst-rep")
        assert res.status_code == 200
        laser = res.json()["lasers"][0]
        assert len(laser["detectors"]) == 1

    def test_legacy_endpoint(self, client, db_session):
        res = client.post("/api/v1/import/instruments", json={"records": [_instrument("inst-leg")]})
        assert res.status_code == 200


# ── MICROSCOPES ──────────────────────────────────────────────────────────────

def _microscope(id_="ms-1"):
    return {
        "id": id_,
        "name": "Test Scope",
        "is_favorite": False,
        "location": None,
        "lasers": [
            {
                "id": "ml-1",
                "wavelength_nm": 488,
                "name": "488nm",
                "excitation_type": "laser",
                "ex_filter_width": None,
                "filters": [
                    {"id": "mf-1", "filter_midpoint": 520, "filter_width": 40, "name": "GFP"},
                ],
            },
        ],
    }


class TestImportMicroscopes:
    def test_preview_new(self, client, db_session):
        res = client.post(
            "/api/v1/import/microscopes/preview", json={"records": [_microscope("ms-new")]}
        )
        body = res.json()
        assert body["resource"] == "microscopes"
        assert len(body["new_items"]) == 1

    def test_preview_conflict_on_child_change(self, client, db_session):
        client.post("/api/v1/import/microscopes/commit", json={"records": [_microscope("ms-c")]})
        mod = _microscope("ms-c")
        mod["lasers"][0]["filters"][0]["filter_midpoint"] = 525
        res = client.post("/api/v1/import/microscopes/preview", json={"records": [mod]})
        body = res.json()
        assert len(body["conflicts"]) == 1
        assert "lasers" in body["conflicts"][0]["diff_fields"]

    def test_commit_replaces_children(self, client, db_session):
        client.post("/api/v1/import/microscopes/commit", json={"records": [_microscope("ms-rep")]})
        mod = _microscope("ms-rep")
        mod["lasers"][0]["filters"] = []  # remove filters
        res = client.post("/api/v1/import/microscopes/commit", json={"records": [mod]})
        assert res.status_code == 200
        after = client.get("/api/v1/microscopes/ms-rep").json()
        assert after["lasers"][0]["filters"] == []

    def test_legacy_endpoint(self, client, db_session):
        res = client.post("/api/v1/import/microscopes", json={"records": [_microscope("ms-leg")]})
        assert res.status_code == 200


# ── FLOW PANELS ──────────────────────────────────────────────────────────────

def _setup_flow_deps(client):
    """Create an instrument + return (antibody_id, detector_id)."""
    client.post("/api/v1/import/instruments/commit", json={"records": [_instrument("inst-flow")]})
    ab = client.get("/api/v1/antibodies").json()["items"][0]
    return ab["id"], "det-1"


class TestImportFlowPanels:
    def test_preview_new(self, client, db_session):
        ab_id, det_id = _setup_flow_deps(client)
        panel = {
            "id": "fp-new",
            "name": "Flow P",
            "instrument_id": "inst-flow",
            "targets": [{"id": "t-1", "antibody_id": ab_id, "staining_mode": "direct",
                         "secondary_antibody_id": None, "sort_order": 0}],
            "assignments": [{"id": "a-1", "antibody_id": ab_id, "fluorophore_id": "test-egfp",
                             "detector_id": det_id, "notes": None}],
        }
        res = client.post("/api/v1/import/flow-panels/preview", json={"records": [panel]})
        body = res.json()
        assert body["resource"] == "flow-panels"
        assert len(body["new_items"]) == 1

    def test_commit_nulls_missing_instrument(self, client, db_session):
        ab_id, _ = _setup_flow_deps(client)
        panel = {
            "id": "fp-noinst", "name": "Stray",
            "instrument_id": "nonexistent",
            "targets": [], "assignments": [],
        }
        res = client.post("/api/v1/import/flow-panels/commit", json={"records": [panel]})
        body = res.json()
        assert body["nulled_instrument_refs"] == 1

    def test_commit_skips_assignment_with_bad_fk(self, client, db_session):
        ab_id, det_id = _setup_flow_deps(client)
        panel = {
            "id": "fp-badfk", "name": "P",
            "instrument_id": "inst-flow",
            "targets": [],
            "assignments": [
                {"id": "a-bad", "antibody_id": ab_id, "fluorophore_id": "test-egfp",
                 "detector_id": "nonexistent-det", "notes": None},
            ],
        }
        res = client.post("/api/v1/import/flow-panels/commit", json={"records": [panel]})
        body = res.json()
        assert body["skipped_assignments"] == 1

    def test_commit_wipes_and_replaces_children(self, client, db_session):
        ab_id, det_id = _setup_flow_deps(client)
        panel_a = {
            "id": "fp-rep", "name": "P",
            "instrument_id": "inst-flow",
            "targets": [{"id": "t-a", "antibody_id": ab_id, "staining_mode": "direct",
                         "secondary_antibody_id": None, "sort_order": 0}],
            "assignments": [],
        }
        client.post("/api/v1/import/flow-panels/commit", json={"records": [panel_a]})
        panel_b = {**panel_a, "targets": []}
        client.post("/api/v1/import/flow-panels/commit", json={"records": [panel_b]})
        after = client.get("/api/v1/panels/fp-rep").json()
        assert after["targets"] == []

    def test_legacy_endpoint(self, client, db_session):
        _setup_flow_deps(client)
        panel = {"id": "fp-leg", "name": "L", "instrument_id": "inst-flow",
                 "targets": [], "assignments": []}
        res = client.post("/api/v1/import/flow-panels", json={"records": [panel]})
        assert res.status_code == 200


# ── IF PANELS ────────────────────────────────────────────────────────────────

def _setup_if_deps(client):
    client.post("/api/v1/import/microscopes/commit", json={"records": [_microscope("ms-if")]})
    ab = client.get("/api/v1/antibodies").json()["items"][0]
    return ab["id"], "mf-1"


class TestImportIFPanels:
    def test_preview_new(self, client, db_session):
        ab_id, filt_id = _setup_if_deps(client)
        panel = {
            "id": "ifp-new", "name": "IF P", "panel_type": "IF",
            "microscope_id": "ms-if", "view_mode": "simple",
            "targets": [], "assignments": [],
        }
        res = client.post("/api/v1/import/if-panels/preview", json={"records": [panel]})
        body = res.json()
        assert body["resource"] == "if-panels"
        assert len(body["new_items"]) == 1

    def test_commit_nulls_missing_microscope_and_filter(self, client, db_session):
        ab_id, _ = _setup_if_deps(client)
        panel = {
            "id": "ifp-null", "name": "N", "panel_type": "IF",
            "microscope_id": "bogus", "view_mode": "simple",
            "targets": [],
            "assignments": [
                {"id": "ia-1", "antibody_id": ab_id, "fluorophore_id": "test-egfp",
                 "filter_id": "bogus-filter", "notes": None},
            ],
        }
        res = client.post("/api/v1/import/if-panels/commit", json={"records": [panel]})
        body = res.json()
        assert body["nulled_microscope_refs"] == 1
        assert body["nulled_filter_refs"] == 1

    def test_commit_skips_assignment_without_fluorophore(self, client, db_session):
        ab_id, filt_id = _setup_if_deps(client)
        panel = {
            "id": "ifp-skip", "name": "S", "panel_type": "IF",
            "microscope_id": "ms-if", "view_mode": "simple",
            "targets": [],
            "assignments": [
                {"id": "ia-bad", "antibody_id": ab_id, "fluorophore_id": "not-a-fluor",
                 "filter_id": filt_id, "notes": None},
            ],
        }
        res = client.post("/api/v1/import/if-panels/commit", json={"records": [panel]})
        body = res.json()
        assert body["skipped_assignments"] == 1

    def test_legacy_endpoint(self, client, db_session):
        _setup_if_deps(client)
        panel = {"id": "ifp-leg", "name": "L", "panel_type": "IF",
                 "microscope_id": "ms-if", "view_mode": "simple",
                 "targets": [], "assignments": []}
        res = client.post("/api/v1/import/if-panels", json={"records": [panel]})
        assert res.status_code == 200
