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
