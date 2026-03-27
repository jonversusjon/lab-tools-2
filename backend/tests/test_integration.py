from __future__ import annotations


def test_full_panel_workflow(client):
    """Create instrument → panel → targets → assignments → GET returns complete data."""
    # Create instrument
    inst_resp = client.post("/api/v1/instruments", json={
        "name": "Test Flow",
        "lasers": [
            {
                "wavelength_nm": 488,
                "name": "Blue",
                "detectors": [
                    {"filter_midpoint": 530, "filter_width": 30, "name": "FITC"},
                    {"filter_midpoint": 582, "filter_width": 15, "name": "PE"},
                ],
            }
        ],
    })
    assert inst_resp.status_code == 201
    inst = inst_resp.json()
    det_fitc = inst["lasers"][0]["detectors"][0]["id"]
    det_pe = inst["lasers"][0]["detectors"][1]["id"]

    # Create panel
    panel_resp = client.post("/api/v1/panels", json={
        "name": "Integration Panel",
        "instrument_id": inst["id"],
    })
    assert panel_resp.status_code == 201
    panel_id = panel_resp.json()["id"]

    # Get seed antibodies and fluorophores
    abs_resp = client.get("/api/v1/antibodies?limit=10")
    antibodies = abs_resp.json()["items"]
    assert len(antibodies) >= 2
    ab1, ab2 = antibodies[0], antibodies[1]

    fls_resp = client.get("/api/v1/fluorophores?limit=50")
    fluorophores = fls_resp.json()["items"]
    fl_map = {fl["name"]: fl for fl in fluorophores}

    # Add targets
    t1 = client.post("/api/v1/panels/%s/targets" % panel_id, json={"antibody_id": ab1["id"]})
    assert t1.status_code == 201
    t2 = client.post("/api/v1/panels/%s/targets" % panel_id, json={"antibody_id": ab2["id"]})
    assert t2.status_code == 201

    # Add assignments using seed fluorophores
    egfp_fl = fl_map.get("EGFP")
    mcherry_fl = fl_map.get("mCherry")
    assert egfp_fl is not None, "EGFP test fluorophore not found"
    assert mcherry_fl is not None, "mCherry test fluorophore not found"

    a1 = client.post("/api/v1/panels/%s/assignments" % panel_id, json={
        "antibody_id": ab1["id"],
        "fluorophore_id": egfp_fl["id"],
        "detector_id": det_fitc,
    })
    assert a1.status_code == 201

    a2 = client.post("/api/v1/panels/%s/assignments" % panel_id, json={
        "antibody_id": ab2["id"],
        "fluorophore_id": mcherry_fl["id"],
        "detector_id": det_pe,
    })
    assert a2.status_code == 201

    # GET panel returns complete data
    get_resp = client.get("/api/v1/panels/%s" % panel_id)
    assert get_resp.status_code == 200
    panel = get_resp.json()
    assert len(panel["targets"]) == 2
    assert len(panel["assignments"]) == 2


def test_delete_instrument_nullifies_panel(client):
    """Delete instrument → panel.instrument_id becomes null, targets preserved, assignments removed."""
    # Create instrument
    inst = client.post("/api/v1/instruments", json={
        "name": "Deletable",
        "lasers": [{"wavelength_nm": 488, "name": "Blue", "detectors": [
            {"filter_midpoint": 530, "filter_width": 30},
        ]}],
    }).json()
    det_id = inst["lasers"][0]["detectors"][0]["id"]

    # Create panel with instrument
    panel = client.post("/api/v1/panels", json={
        "name": "Panel for Delete Test",
        "instrument_id": inst["id"],
    }).json()

    # Add target and assignment
    ab = client.get("/api/v1/antibodies?limit=1").json()["items"][0]
    fl = client.get("/api/v1/fluorophores?limit=1").json()["items"][0]
    client.post("/api/v1/panels/%s/targets" % panel["id"], json={"antibody_id": ab["id"]})
    client.post("/api/v1/panels/%s/assignments" % panel["id"], json={
        "antibody_id": ab["id"],
        "fluorophore_id": fl["id"],
        "detector_id": det_id,
    })

    # Delete instrument
    del_resp = client.delete("/api/v1/instruments/%s" % inst["id"])
    assert del_resp.status_code == 204

    # Panel still exists with null instrument, targets preserved, assignments removed
    panel_resp = client.get("/api/v1/panels/%s" % panel["id"])
    assert panel_resp.status_code == 200
    panel_data = panel_resp.json()
    assert panel_data["instrument_id"] is None
    assert len(panel_data["targets"]) == 1
    assert len(panel_data["assignments"]) == 0


def test_seed_data_assignments_no_fk_violations(client):
    """Seed data → create panel with seed instrument → assign seed fluorophores → no FK violations."""
    # Get seed instrument
    insts = client.get("/api/v1/instruments?limit=1").json()["items"]
    assert len(insts) >= 1
    inst = client.get("/api/v1/instruments/%s" % insts[0]["id"]).json()
    det = inst["lasers"][0]["detectors"][0]

    # Create panel
    panel = client.post("/api/v1/panels", json={
        "name": "Seed Test Panel",
        "instrument_id": inst["id"],
    }).json()

    ab = client.get("/api/v1/antibodies?limit=1").json()["items"][0]
    fl = client.get("/api/v1/fluorophores?limit=1").json()["items"][0]

    client.post("/api/v1/panels/%s/targets" % panel["id"], json={"antibody_id": ab["id"]})
    resp = client.post("/api/v1/panels/%s/assignments" % panel["id"], json={
        "antibody_id": ab["id"],
        "fluorophore_id": fl["id"],
        "detector_id": det["id"],
    })
    assert resp.status_code == 201


def test_assignment_lifecycle(client):
    """Add 3 assignments → remove 1 → add different → uniqueness holds."""
    inst = client.post("/api/v1/instruments", json={
        "name": "Lifecycle Inst",
        "lasers": [{
            "wavelength_nm": 488, "name": "Blue",
            "detectors": [
                {"filter_midpoint": 530, "filter_width": 30},
                {"filter_midpoint": 582, "filter_width": 15},
                {"filter_midpoint": 610, "filter_width": 20},
            ],
        }],
    }).json()
    dets = [d["id"] for d in inst["lasers"][0]["detectors"]]

    panel = client.post("/api/v1/panels", json={
        "name": "Lifecycle Panel",
        "instrument_id": inst["id"],
    }).json()
    panel_id = panel["id"]

    abs_list = client.get("/api/v1/antibodies?limit=3").json()["items"]
    fls = client.get("/api/v1/fluorophores?limit=3").json()["items"]

    # Add 3 targets
    for ab in abs_list:
        client.post("/api/v1/panels/%s/targets" % panel_id, json={"antibody_id": ab["id"]})

    # Add 3 assignments
    a_ids = []
    for i in range(3):
        resp = client.post("/api/v1/panels/%s/assignments" % panel_id, json={
            "antibody_id": abs_list[i]["id"],
            "fluorophore_id": fls[i]["id"],
            "detector_id": dets[i],
        })
        assert resp.status_code == 201
        a_ids.append(resp.json()["id"])

    # Remove first
    del_resp = client.delete("/api/v1/panels/%s/assignments/%s" % (panel_id, a_ids[0]))
    assert del_resp.status_code == 204

    # Add a different assignment for the first antibody
    resp = client.post("/api/v1/panels/%s/assignments" % panel_id, json={
        "antibody_id": abs_list[0]["id"],
        "fluorophore_id": fls[0]["id"],
        "detector_id": dets[0],
    })
    assert resp.status_code == 201

    # Verify 3 assignments exist
    panel_data = client.get("/api/v1/panels/%s" % panel_id).json()
    assert len(panel_data["assignments"]) == 3


def test_change_panel_instrument_clears_assignments_preserves_targets(client):
    """Change instrument → assignments deleted, targets preserved."""
    inst1 = client.post("/api/v1/instruments", json={
        "name": "Inst1",
        "lasers": [{"wavelength_nm": 488, "name": "Blue", "detectors": [
            {"filter_midpoint": 530, "filter_width": 30},
        ]}],
    }).json()
    inst2 = client.post("/api/v1/instruments", json={
        "name": "Inst2",
        "lasers": [{"wavelength_nm": 637, "name": "Red", "detectors": [
            {"filter_midpoint": 670, "filter_width": 30},
        ]}],
    }).json()

    panel = client.post("/api/v1/panels", json={
        "name": "Swap Inst Panel",
        "instrument_id": inst1["id"],
    }).json()
    panel_id = panel["id"]

    ab = client.get("/api/v1/antibodies?limit=1").json()["items"][0]
    fl = client.get("/api/v1/fluorophores?limit=1").json()["items"][0]
    det_id = inst1["lasers"][0]["detectors"][0]["id"]

    client.post("/api/v1/panels/%s/targets" % panel_id, json={"antibody_id": ab["id"]})
    client.post("/api/v1/panels/%s/assignments" % panel_id, json={
        "antibody_id": ab["id"],
        "fluorophore_id": fl["id"],
        "detector_id": det_id,
    })

    # Change instrument
    resp = client.put("/api/v1/panels/%s" % panel_id, json={
        "name": "Swap Inst Panel",
        "instrument_id": inst2["id"],
    })
    assert resp.status_code == 200

    panel_data = client.get("/api/v1/panels/%s" % panel_id).json()
    assert panel_data["instrument_id"] == inst2["id"]
    assert len(panel_data["targets"]) == 1
    assert len(panel_data["assignments"]) == 0


def test_panel_null_instrument_target_management(client):
    """Panel with null instrument → can manage targets but not assignments."""
    panel = client.post("/api/v1/panels", json={
        "name": "No Inst Panel",
        "instrument_id": None,
    }).json()
    panel_id = panel["id"]

    ab = client.get("/api/v1/antibodies?limit=1").json()["items"][0]

    # Add target works
    t = client.post("/api/v1/panels/%s/targets" % panel_id, json={"antibody_id": ab["id"]})
    assert t.status_code == 201

    # Cannot add assignment (no instrument)
    fl = client.get("/api/v1/fluorophores?limit=1").json()["items"][0]
    a = client.post("/api/v1/panels/%s/assignments" % panel_id, json={
        "antibody_id": ab["id"],
        "fluorophore_id": fl["id"],
        "detector_id": "nonexistent",
    })
    assert a.status_code == 400

    # Remove target works
    target_id = t.json()["id"]
    del_resp = client.delete("/api/v1/panels/%s/targets/%s" % (panel_id, target_id))
    assert del_resp.status_code == 204


def test_remove_target_cascades_assignment(client):
    """Remove target that has assignment → both removed."""
    inst = client.post("/api/v1/instruments", json={
        "name": "Cascade Inst",
        "lasers": [{"wavelength_nm": 488, "name": "Blue", "detectors": [
            {"filter_midpoint": 530, "filter_width": 30},
        ]}],
    }).json()

    panel = client.post("/api/v1/panels", json={
        "name": "Cascade Panel",
        "instrument_id": inst["id"],
    }).json()
    panel_id = panel["id"]

    ab = client.get("/api/v1/antibodies?limit=1").json()["items"][0]
    fl = client.get("/api/v1/fluorophores?limit=1").json()["items"][0]
    det_id = inst["lasers"][0]["detectors"][0]["id"]

    target = client.post("/api/v1/panels/%s/targets" % panel_id, json={"antibody_id": ab["id"]}).json()
    client.post("/api/v1/panels/%s/assignments" % panel_id, json={
        "antibody_id": ab["id"],
        "fluorophore_id": fl["id"],
        "detector_id": det_id,
    })

    # Remove target
    del_resp = client.delete("/api/v1/panels/%s/targets/%s" % (panel_id, target["id"]))
    assert del_resp.status_code == 204

    panel_data = client.get("/api/v1/panels/%s" % panel_id).json()
    assert len(panel_data["targets"]) == 0
    assert len(panel_data["assignments"]) == 0


def test_delete_antibody_cascades_to_panel_target_and_assignment(client):
    """Delete antibody → its target and assignment in panels both removed."""
    # Create a fresh antibody
    ab = client.post("/api/v1/antibodies", json={
        "target": "CascadeMarker",
        "clone": "CAS1",
    }).json()

    inst = client.post("/api/v1/instruments", json={
        "name": "Ab Cascade Inst",
        "lasers": [{"wavelength_nm": 488, "name": "Blue", "detectors": [
            {"filter_midpoint": 530, "filter_width": 30},
        ]}],
    }).json()

    panel = client.post("/api/v1/panels", json={
        "name": "Ab Cascade Panel",
        "instrument_id": inst["id"],
    }).json()

    fl = client.get("/api/v1/fluorophores?limit=1").json()["items"][0]
    det_id = inst["lasers"][0]["detectors"][0]["id"]

    client.post("/api/v1/panels/%s/targets" % panel["id"], json={"antibody_id": ab["id"]})
    client.post("/api/v1/panels/%s/assignments" % panel["id"], json={
        "antibody_id": ab["id"],
        "fluorophore_id": fl["id"],
        "detector_id": det_id,
    })

    # Delete antibody
    del_resp = client.delete("/api/v1/antibodies/%s" % ab["id"])
    assert del_resp.status_code == 204

    panel_data = client.get("/api/v1/panels/%s" % panel["id"]).json()
    assert len(panel_data["targets"]) == 0
    assert len(panel_data["assignments"]) == 0
