from __future__ import annotations


def _get_seed_instrument(client):
    resp = client.get("/api/v1/instruments")
    return resp.json()["items"][0]


def _get_seed_antibody(client, index=0):
    resp = client.get("/api/v1/antibodies")
    return resp.json()["items"][index]


def _get_seed_fluorophore(client, index=0):
    resp = client.get("/api/v1/fluorophores")
    return resp.json()["items"][index]


def _get_detector_id(instrument, laser_index=0, detector_index=0):
    return instrument["lasers"][laser_index]["detectors"][detector_index]["id"]


def test_create_panel_with_instrument(client):
    inst = _get_seed_instrument(client)
    resp = client.post("/api/v1/panels", json={"name": "P1", "instrument_id": inst["id"]})
    assert resp.status_code == 201
    assert resp.json()["instrument_id"] == inst["id"]


def test_create_panel_nonexistent_instrument(client):
    resp = client.post("/api/v1/panels", json={"name": "P1", "instrument_id": "nonexistent"})
    assert resp.status_code == 404


def test_create_panel_null_instrument(client):
    resp = client.post("/api/v1/panels", json={"name": "P1", "instrument_id": None})
    assert resp.status_code == 201
    assert resp.json()["instrument_id"] is None


def test_add_target(client):
    inst = _get_seed_instrument(client)
    ab = _get_seed_antibody(client)
    panel = client.post("/api/v1/panels", json={"name": "P1", "instrument_id": inst["id"]}).json()

    resp = client.post("/api/v1/panels/%s/targets" % panel["id"], json={"antibody_id": ab["id"]})
    assert resp.status_code == 201

    panel_data = client.get("/api/v1/panels/%s" % panel["id"]).json()
    assert len(panel_data["targets"]) == 1
    assert panel_data["targets"][0]["antibody_id"] == ab["id"]


def test_add_duplicate_target(client):
    ab = _get_seed_antibody(client)
    panel = client.post("/api/v1/panels", json={"name": "P1"}).json()

    client.post("/api/v1/panels/%s/targets" % panel["id"], json={"antibody_id": ab["id"]})
    resp = client.post("/api/v1/panels/%s/targets" % panel["id"], json={"antibody_id": ab["id"]})
    assert resp.status_code == 409


def test_remove_target_cascades_to_assignment(client):
    inst = _get_seed_instrument(client)
    ab = _get_seed_antibody(client)
    fl = _get_seed_fluorophore(client)
    det_id = _get_detector_id(inst)

    panel = client.post("/api/v1/panels", json={"name": "P1", "instrument_id": inst["id"]}).json()
    panel_id = panel["id"]

    # Add target, then assignment
    target_resp = client.post("/api/v1/panels/%s/targets" % panel_id, json={"antibody_id": ab["id"]})
    target_id = target_resp.json()["id"]

    client.post("/api/v1/panels/%s/assignments" % panel_id, json={
        "antibody_id": ab["id"], "fluorophore_id": fl["id"], "detector_id": det_id,
    })

    # Remove target — should also remove the assignment
    resp = client.delete("/api/v1/panels/%s/targets/%s" % (panel_id, target_id))
    assert resp.status_code == 204

    panel_data = client.get("/api/v1/panels/%s" % panel_id).json()
    assert len(panel_data["targets"]) == 0
    assert len(panel_data["assignments"]) == 0


def test_add_assignment(client):
    inst = _get_seed_instrument(client)
    ab = _get_seed_antibody(client)
    fl = _get_seed_fluorophore(client)
    det_id = _get_detector_id(inst)

    panel = client.post("/api/v1/panels", json={"name": "P1", "instrument_id": inst["id"]}).json()
    panel_id = panel["id"]

    client.post("/api/v1/panels/%s/targets" % panel_id, json={"antibody_id": ab["id"]})

    resp = client.post("/api/v1/panels/%s/assignments" % panel_id, json={
        "antibody_id": ab["id"], "fluorophore_id": fl["id"], "detector_id": det_id,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["antibody_id"] == ab["id"]
    assert data["fluorophore_id"] == fl["id"]
    assert data["detector_id"] == det_id


def test_add_assignment_no_instrument(client):
    ab = _get_seed_antibody(client)
    fl = _get_seed_fluorophore(client)

    panel = client.post("/api/v1/panels", json={"name": "P1"}).json()
    client.post("/api/v1/panels/%s/targets" % panel["id"], json={"antibody_id": ab["id"]})

    resp = client.post("/api/v1/panels/%s/assignments" % panel["id"], json={
        "antibody_id": ab["id"], "fluorophore_id": fl["id"], "detector_id": "fake",
    })
    assert resp.status_code == 400
    assert "no instrument" in resp.json()["detail"].lower()


def test_add_assignment_antibody_not_target(client):
    inst = _get_seed_instrument(client)
    ab = _get_seed_antibody(client)
    fl = _get_seed_fluorophore(client)
    det_id = _get_detector_id(inst)

    panel = client.post("/api/v1/panels", json={"name": "P1", "instrument_id": inst["id"]}).json()

    # No target added — should fail
    resp = client.post("/api/v1/panels/%s/assignments" % panel["id"], json={
        "antibody_id": ab["id"], "fluorophore_id": fl["id"], "detector_id": det_id,
    })
    assert resp.status_code == 400
    assert "target" in resp.json()["detail"].lower()


def test_add_assignment_detector_wrong_instrument(client):
    # Create a second instrument with its own detector
    inst2 = client.post("/api/v1/instruments", json={
        "name": "Other",
        "lasers": [{"wavelength_nm": 405, "name": "V", "detectors": [{"filter_midpoint": 450, "filter_width": 40}]}],
    }).json()
    other_det_id = inst2["lasers"][0]["detectors"][0]["id"]

    inst = _get_seed_instrument(client)
    ab = _get_seed_antibody(client)
    fl = _get_seed_fluorophore(client)

    panel = client.post("/api/v1/panels", json={"name": "P1", "instrument_id": inst["id"]}).json()
    client.post("/api/v1/panels/%s/targets" % panel["id"], json={"antibody_id": ab["id"]})

    resp = client.post("/api/v1/panels/%s/assignments" % panel["id"], json={
        "antibody_id": ab["id"], "fluorophore_id": fl["id"], "detector_id": other_det_id,
    })
    assert resp.status_code == 400
    assert "does not belong" in resp.json()["detail"].lower()


def test_duplicate_antibody_assignment(client):
    inst = _get_seed_instrument(client)
    ab = _get_seed_antibody(client)
    fl = _get_seed_fluorophore(client)
    det_id_1 = _get_detector_id(inst, 0, 0)
    det_id_2 = _get_detector_id(inst, 0, 1)

    panel = client.post("/api/v1/panels", json={"name": "P1", "instrument_id": inst["id"]}).json()
    panel_id = panel["id"]

    client.post("/api/v1/panels/%s/targets" % panel_id, json={"antibody_id": ab["id"]})
    client.post("/api/v1/panels/%s/assignments" % panel_id, json={
        "antibody_id": ab["id"], "fluorophore_id": fl["id"], "detector_id": det_id_1,
    })

    # Same antibody, different detector
    resp = client.post("/api/v1/panels/%s/assignments" % panel_id, json={
        "antibody_id": ab["id"], "fluorophore_id": fl["id"], "detector_id": det_id_2,
    })
    assert resp.status_code == 409


def test_duplicate_detector_assignment(client):
    inst = _get_seed_instrument(client)
    ab1 = _get_seed_antibody(client, 0)
    ab2 = _get_seed_antibody(client, 1)
    fl = _get_seed_fluorophore(client)
    det_id = _get_detector_id(inst)

    panel = client.post("/api/v1/panels", json={"name": "P1", "instrument_id": inst["id"]}).json()
    panel_id = panel["id"]

    client.post("/api/v1/panels/%s/targets" % panel_id, json={"antibody_id": ab1["id"]})
    client.post("/api/v1/panels/%s/targets" % panel_id, json={"antibody_id": ab2["id"]})

    client.post("/api/v1/panels/%s/assignments" % panel_id, json={
        "antibody_id": ab1["id"], "fluorophore_id": fl["id"], "detector_id": det_id,
    })

    # Same detector, different antibody
    resp = client.post("/api/v1/panels/%s/assignments" % panel_id, json={
        "antibody_id": ab2["id"], "fluorophore_id": fl["id"], "detector_id": det_id,
    })
    assert resp.status_code == 409


def test_remove_assignment(client):
    inst = _get_seed_instrument(client)
    ab = _get_seed_antibody(client)
    fl = _get_seed_fluorophore(client)
    det_id = _get_detector_id(inst)

    panel = client.post("/api/v1/panels", json={"name": "P1", "instrument_id": inst["id"]}).json()
    panel_id = panel["id"]

    client.post("/api/v1/panels/%s/targets" % panel_id, json={"antibody_id": ab["id"]})
    assign_resp = client.post("/api/v1/panels/%s/assignments" % panel_id, json={
        "antibody_id": ab["id"], "fluorophore_id": fl["id"], "detector_id": det_id,
    })
    assign_id = assign_resp.json()["id"]

    resp = client.delete("/api/v1/panels/%s/assignments/%s" % (panel_id, assign_id))
    assert resp.status_code == 204

    panel_data = client.get("/api/v1/panels/%s" % panel_id).json()
    assert len(panel_data["assignments"]) == 0
    # Target should still be there
    assert len(panel_data["targets"]) == 1


def test_delete_panel_cascades(client):
    ab = _get_seed_antibody(client)
    panel = client.post("/api/v1/panels", json={"name": "P1"}).json()
    panel_id = panel["id"]
    client.post("/api/v1/panels/%s/targets" % panel_id, json={"antibody_id": ab["id"]})

    resp = client.delete("/api/v1/panels/%s" % panel_id)
    assert resp.status_code == 204

    resp2 = client.get("/api/v1/panels/%s" % panel_id)
    assert resp2.status_code == 404


def test_update_panel_instrument_clears_assignments(client):
    inst = _get_seed_instrument(client)
    ab = _get_seed_antibody(client)
    fl = _get_seed_fluorophore(client)
    det_id = _get_detector_id(inst)

    panel = client.post("/api/v1/panels", json={"name": "P1", "instrument_id": inst["id"]}).json()
    panel_id = panel["id"]

    client.post("/api/v1/panels/%s/targets" % panel_id, json={"antibody_id": ab["id"]})
    client.post("/api/v1/panels/%s/assignments" % panel_id, json={
        "antibody_id": ab["id"], "fluorophore_id": fl["id"], "detector_id": det_id,
    })

    # Create a second instrument and switch
    inst2 = client.post("/api/v1/instruments", json={"name": "Other", "lasers": []}).json()
    resp = client.put("/api/v1/panels/%s" % panel_id, json={
        "name": "P1", "instrument_id": inst2["id"],
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["instrument_id"] == inst2["id"]
    assert len(data["assignments"]) == 0
    assert len(data["targets"]) == 1  # targets preserved


def test_update_panel_instrument_to_null_clears_assignments(client):
    inst = _get_seed_instrument(client)
    ab = _get_seed_antibody(client)
    fl = _get_seed_fluorophore(client)
    det_id = _get_detector_id(inst)

    panel = client.post("/api/v1/panels", json={"name": "P1", "instrument_id": inst["id"]}).json()
    panel_id = panel["id"]

    client.post("/api/v1/panels/%s/targets" % panel_id, json={"antibody_id": ab["id"]})
    client.post("/api/v1/panels/%s/assignments" % panel_id, json={
        "antibody_id": ab["id"], "fluorophore_id": fl["id"], "detector_id": det_id,
    })

    resp = client.put("/api/v1/panels/%s" % panel_id, json={
        "name": "P1", "instrument_id": None,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["instrument_id"] is None
    assert len(data["assignments"]) == 0
    assert len(data["targets"]) == 1


# --- Phase 7A: Empty rows, staining modes, secondary antibodies, reorder ---


def test_add_empty_target_row(client):
    """Adding a target with null antibody_id creates an empty placeholder row."""
    panel = client.post("/api/v1/panels", json={"name": "P1"}).json()
    resp = client.post(
        "/api/v1/panels/%s/targets" % panel["id"],
        json={"antibody_id": None},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["antibody_id"] is None
    assert data["staining_mode"] == "direct"
    assert data["sort_order"] == 0


def test_multiple_empty_rows_allowed(client):
    """Multiple null-antibody rows are allowed."""
    panel = client.post("/api/v1/panels", json={"name": "P1"}).json()
    pid = panel["id"]
    r1 = client.post("/api/v1/panels/%s/targets" % pid, json={"antibody_id": None})
    r2 = client.post("/api/v1/panels/%s/targets" % pid, json={"antibody_id": None})
    assert r1.status_code == 201
    assert r2.status_code == 201
    assert r1.json()["sort_order"] == 0
    assert r2.json()["sort_order"] == 1


def test_update_target_set_antibody(client):
    """Updating a target's antibody_id works."""
    ab = _get_seed_antibody(client)
    panel = client.post("/api/v1/panels", json={"name": "P1"}).json()
    pid = panel["id"]
    target = client.post("/api/v1/panels/%s/targets" % pid, json={"antibody_id": None}).json()

    resp = client.put(
        "/api/v1/panels/%s/targets/%s" % (pid, target["id"]),
        json={"antibody_id": ab["id"]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["antibody_id"] == ab["id"]
    assert data["antibody_target"] == ab["target"]


def test_update_target_duplicate_antibody_409(client):
    """Setting an antibody that already exists in the panel returns 409."""
    ab = _get_seed_antibody(client)
    panel = client.post("/api/v1/panels", json={"name": "P1"}).json()
    pid = panel["id"]
    client.post("/api/v1/panels/%s/targets" % pid, json={"antibody_id": ab["id"]})
    t2 = client.post("/api/v1/panels/%s/targets" % pid, json={"antibody_id": None}).json()

    resp = client.put(
        "/api/v1/panels/%s/targets/%s" % (pid, t2["id"]),
        json={"antibody_id": ab["id"]},
    )
    assert resp.status_code == 409


def test_update_target_staining_mode_indirect(client):
    """Setting staining_mode to indirect with a secondary antibody."""
    ab = _get_seed_antibody(client)
    panel = client.post("/api/v1/panels", json={"name": "P1"}).json()
    pid = panel["id"]
    target = client.post(
        "/api/v1/panels/%s/targets" % pid,
        json={"antibody_id": ab["id"]},
    ).json()

    resp = client.put(
        "/api/v1/panels/%s/targets/%s" % (pid, target["id"]),
        json={
            "staining_mode": "indirect",
            "secondary_antibody_id": "test-secondary-with-fluor",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["staining_mode"] == "indirect"
    assert data["secondary_antibody_id"] == "test-secondary-with-fluor"
    assert data["secondary_antibody_name"] == "Goat anti-Mouse IgG AF488"
    assert data["secondary_fluorophore_id"] == "test-egfp"


def test_update_target_direct_clears_secondary(client):
    """Switching to direct mode clears the secondary antibody."""
    ab = _get_seed_antibody(client)
    panel = client.post("/api/v1/panels", json={"name": "P1"}).json()
    pid = panel["id"]
    target = client.post(
        "/api/v1/panels/%s/targets" % pid,
        json={"antibody_id": ab["id"], "staining_mode": "indirect", "secondary_antibody_id": "test-secondary-with-fluor"},
    ).json()

    resp = client.put(
        "/api/v1/panels/%s/targets/%s" % (pid, target["id"]),
        json={"staining_mode": "direct"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["staining_mode"] == "direct"
    assert data["secondary_antibody_id"] is None


def test_reorder_targets(client):
    """Reordering targets updates sort_order correctly."""
    ab1 = _get_seed_antibody(client, 0)
    ab2 = _get_seed_antibody(client, 1)
    panel = client.post("/api/v1/panels", json={"name": "P1"}).json()
    pid = panel["id"]

    t1 = client.post("/api/v1/panels/%s/targets" % pid, json={"antibody_id": ab1["id"]}).json()
    t2 = client.post("/api/v1/panels/%s/targets" % pid, json={"antibody_id": ab2["id"]}).json()

    # Reverse order
    resp = client.put(
        "/api/v1/panels/%s/targets/reorder" % pid,
        json={"target_ids": [t2["id"], t1["id"]]},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data[0]["id"] == t2["id"]
    assert data[0]["sort_order"] == 0
    assert data[1]["id"] == t1["id"]
    assert data[1]["sort_order"] == 1


def test_reorder_targets_invalid_ids(client):
    """Reordering with wrong IDs returns 400."""
    panel = client.post("/api/v1/panels", json={"name": "P1"}).json()
    pid = panel["id"]
    client.post("/api/v1/panels/%s/targets" % pid, json={"antibody_id": None})

    resp = client.put(
        "/api/v1/panels/%s/targets/reorder" % pid,
        json={"target_ids": ["nonexistent"]},
    )
    assert resp.status_code == 400


def test_target_response_includes_joined_fields(client):
    """Target response includes antibody_name and antibody_target."""
    ab = _get_seed_antibody(client)
    panel = client.post("/api/v1/panels", json={"name": "P1"}).json()
    pid = panel["id"]

    resp = client.post(
        "/api/v1/panels/%s/targets" % pid,
        json={"antibody_id": ab["id"]},
    )
    data = resp.json()
    assert data["antibody_target"] == ab["target"]
    assert "staining_mode" in data
    assert "secondary_antibody_id" in data


def test_panel_get_returns_sorted_targets(client):
    """GET panel returns targets sorted by sort_order."""
    ab1 = _get_seed_antibody(client, 0)
    ab2 = _get_seed_antibody(client, 1)
    panel = client.post("/api/v1/panels", json={"name": "P1"}).json()
    pid = panel["id"]

    t1 = client.post("/api/v1/panels/%s/targets" % pid, json={"antibody_id": ab1["id"]}).json()
    t2 = client.post("/api/v1/panels/%s/targets" % pid, json={"antibody_id": ab2["id"]}).json()

    # Reorder: t2 first
    client.put(
        "/api/v1/panels/%s/targets/reorder" % pid,
        json={"target_ids": [t2["id"], t1["id"]]},
    )

    panel_data = client.get("/api/v1/panels/%s" % pid).json()
    assert panel_data["targets"][0]["id"] == t2["id"]
    assert panel_data["targets"][1]["id"] == t1["id"]


def test_update_target_changes_antibody_deletes_old_assignment(client):
    """Changing a target's antibody deletes any existing assignment for the old antibody."""
    inst = _get_seed_instrument(client)
    ab1 = _get_seed_antibody(client, 0)
    ab2 = _get_seed_antibody(client, 1)
    fl = _get_seed_fluorophore(client)
    det_id = _get_detector_id(inst)

    panel = client.post("/api/v1/panels", json={"name": "P1", "instrument_id": inst["id"]}).json()
    pid = panel["id"]

    target = client.post("/api/v1/panels/%s/targets" % pid, json={"antibody_id": ab1["id"]}).json()
    client.post("/api/v1/panels/%s/assignments" % pid, json={
        "antibody_id": ab1["id"], "fluorophore_id": fl["id"], "detector_id": det_id,
    })

    # Change antibody on target — should delete the old assignment
    resp = client.put(
        "/api/v1/panels/%s/targets/%s" % (pid, target["id"]),
        json={"antibody_id": ab2["id"]},
    )
    assert resp.status_code == 200

    panel_data = client.get("/api/v1/panels/%s" % pid).json()
    assert len(panel_data["assignments"]) == 0


# --- Phase B: Polymorphic Targets ---


def test_add_dye_label_target(client):
    """POST a dye_label target — response includes dye_label_name and dye_label_target."""
    panel = client.post("/api/v1/panels", json={"name": "P1"}).json()
    pid = panel["id"]

    resp = client.post(
        "/api/v1/panels/%s/targets" % pid,
        json={"dye_label_id": "test-dye-label-with-fluor"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["dye_label_id"] == "test-dye-label-with-fluor"
    assert data["dye_label_name"] == "MitoSOX Red"
    assert data["dye_label_target"] == "Mitochondrial Superoxide"
    assert data["dye_label_fluorophore_id"] == "test-mcherry"
    assert data["antibody_id"] is None
    assert data["staining_mode"] == "direct"


def test_add_dye_label_target_forces_direct(client):
    """POST a dye_label target with staining_mode 'indirect' — forced to 'direct'."""
    panel = client.post("/api/v1/panels", json={"name": "P1"}).json()
    pid = panel["id"]

    resp = client.post(
        "/api/v1/panels/%s/targets" % pid,
        json={"dye_label_id": "test-dye-label-with-fluor", "staining_mode": "indirect"},
    )
    assert resp.status_code == 201
    assert resp.json()["staining_mode"] == "direct"


def test_dye_label_target_duplicate_409(client):
    """Adding the same dye_label twice returns 409."""
    panel = client.post("/api/v1/panels", json={"name": "P1"}).json()
    pid = panel["id"]

    client.post("/api/v1/panels/%s/targets" % pid, json={"dye_label_id": "test-dye-label-with-fluor"})
    resp = client.post("/api/v1/panels/%s/targets" % pid, json={"dye_label_id": "test-dye-label-with-fluor"})
    assert resp.status_code == 409


def test_both_antibody_and_dye_label_400(client):
    """POST with both antibody_id and dye_label_id returns 400."""
    ab = _get_seed_antibody(client)
    panel = client.post("/api/v1/panels", json={"name": "P1"}).json()
    pid = panel["id"]

    resp = client.post(
        "/api/v1/panels/%s/targets" % pid,
        json={"antibody_id": ab["id"], "dye_label_id": "test-dye-label-with-fluor"},
    )
    assert resp.status_code == 400


def test_assign_dye_label_fluorophore(client):
    """Create dye_label target, then create assignment with dye_label_id."""
    inst = _get_seed_instrument(client)
    fl = _get_seed_fluorophore(client)
    det_id = _get_detector_id(inst)

    panel = client.post("/api/v1/panels", json={"name": "P1", "instrument_id": inst["id"]}).json()
    pid = panel["id"]

    client.post("/api/v1/panels/%s/targets" % pid, json={"dye_label_id": "test-dye-label-with-fluor"})

    resp = client.post(
        "/api/v1/panels/%s/assignments" % pid,
        json={"dye_label_id": "test-dye-label-with-fluor", "fluorophore_id": fl["id"], "detector_id": det_id},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["dye_label_id"] == "test-dye-label-with-fluor"
    assert data["antibody_id"] is None


def test_remove_dye_label_target_cascades_assignment(client):
    """Removing a dye_label target also removes its assignment."""
    inst = _get_seed_instrument(client)
    fl = _get_seed_fluorophore(client)
    det_id = _get_detector_id(inst)

    panel = client.post("/api/v1/panels", json={"name": "P1", "instrument_id": inst["id"]}).json()
    pid = panel["id"]

    target_resp = client.post(
        "/api/v1/panels/%s/targets" % pid,
        json={"dye_label_id": "test-dye-label-with-fluor"},
    )
    target_id = target_resp.json()["id"]

    client.post(
        "/api/v1/panels/%s/assignments" % pid,
        json={"dye_label_id": "test-dye-label-with-fluor", "fluorophore_id": fl["id"], "detector_id": det_id},
    )

    resp = client.delete("/api/v1/panels/%s/targets/%s" % (pid, target_id))
    assert resp.status_code == 204

    panel_data = client.get("/api/v1/panels/%s" % pid).json()
    assert len(panel_data["targets"]) == 0
    assert len(panel_data["assignments"]) == 0
