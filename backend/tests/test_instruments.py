from __future__ import annotations


def test_seed_instrument_exists(client):
    resp = client.get("/api/v1/instruments")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    names = [i["name"] for i in data["items"]]
    assert "BD FACSAria III (4-laser)" in names


def test_list_returns_paginated_response(client):
    resp = client.get("/api/v1/instruments")
    data = resp.json()
    assert "items" in data
    assert "total" in data
    assert "skip" in data
    assert "limit" in data


def test_create_instrument_with_nested_lasers_detectors(client):
    payload = {
        "name": "Test Cytometer",
        "lasers": [
            {
                "wavelength_nm": 488,
                "name": "Blue",
                "detectors": [
                    {"filter_midpoint": 530, "filter_width": 30},
                    {"filter_midpoint": 695, "filter_width": 40},
                    {"filter_midpoint": 780, "filter_width": 60},
                ],
            },
            {
                "wavelength_nm": 637,
                "name": "Red",
                "detectors": [
                    {"filter_midpoint": 670, "filter_width": 30},
                    {"filter_midpoint": 780, "filter_width": 60},
                ],
            },
        ],
    }
    resp = client.post("/api/v1/instruments", json=payload)
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Cytometer"
    assert len(data["lasers"]) == 2
    assert len(data["lasers"][0]["detectors"]) == 3
    assert len(data["lasers"][1]["detectors"]) == 2

    # GET returns same nested structure
    resp2 = client.get("/api/v1/instruments/%s" % data["id"])
    assert resp2.status_code == 200
    assert len(resp2.json()["lasers"]) == 2


def test_update_instrument_replaces_lasers(client):
    # Create an instrument
    payload = {
        "name": "Old",
        "lasers": [
            {"wavelength_nm": 488, "name": "Blue", "detectors": [{"filter_midpoint": 530, "filter_width": 30}]},
        ],
    }
    resp = client.post("/api/v1/instruments", json=payload)
    inst_id = resp.json()["id"]

    # Update with new lasers
    update_payload = {
        "name": "Updated",
        "lasers": [
            {"wavelength_nm": 405, "name": "Violet", "detectors": [{"filter_midpoint": 450, "filter_width": 40}]},
            {"wavelength_nm": 637, "name": "Red", "detectors": [{"filter_midpoint": 670, "filter_width": 30}]},
        ],
    }
    resp2 = client.put("/api/v1/instruments/%s" % inst_id, json=update_payload)
    assert resp2.status_code == 200
    data = resp2.json()
    assert data["name"] == "Updated"
    assert len(data["lasers"]) == 2
    assert data["lasers"][0]["name"] == "Violet"


def test_update_instrument_blocked_when_detector_in_use(client):
    # Create instrument
    inst_resp = client.post("/api/v1/instruments", json={
        "name": "InUse",
        "lasers": [{"wavelength_nm": 488, "name": "Blue", "detectors": [{"filter_midpoint": 530, "filter_width": 30}]}],
    })
    inst = inst_resp.json()
    det_id = inst["lasers"][0]["detectors"][0]["id"]

    # Create panel + target + assignment using this detector
    fl_resp = client.get("/api/v1/fluorophores")
    fl_id = fl_resp.json()["items"][0]["id"]

    ab_resp = client.get("/api/v1/antibodies")
    ab_id = ab_resp.json()["items"][0]["id"]

    panel_resp = client.post("/api/v1/panels", json={"name": "P1", "instrument_id": inst["id"]})
    panel_id = panel_resp.json()["id"]

    client.post("/api/v1/panels/%s/targets" % panel_id, json={"antibody_id": ab_id})
    client.post("/api/v1/panels/%s/assignments" % panel_id, json={
        "antibody_id": ab_id, "fluorophore_id": fl_id, "detector_id": det_id,
    })

    # Try to update instrument — should be blocked
    resp = client.put("/api/v1/instruments/%s" % inst["id"], json={
        "name": "Updated",
        "lasers": [{"wavelength_nm": 405, "name": "Violet", "detectors": [{"filter_midpoint": 450, "filter_width": 40}]}],
    })
    assert resp.status_code == 409


def test_delete_instrument_sets_panel_instrument_to_null(client):
    inst_resp = client.post("/api/v1/instruments", json={"name": "ToDelete", "lasers": []})
    inst_id = inst_resp.json()["id"]

    panel_resp = client.post("/api/v1/panels", json={"name": "P1", "instrument_id": inst_id})
    panel_id = panel_resp.json()["id"]

    client.delete("/api/v1/instruments/%s" % inst_id)

    panel = client.get("/api/v1/panels/%s" % panel_id).json()
    assert panel["instrument_id"] is None


def test_delete_instrument_cascades_to_lasers_detectors(client):
    inst_resp = client.post("/api/v1/instruments", json={
        "name": "CascadeTest",
        "lasers": [{"wavelength_nm": 488, "name": "Blue", "detectors": [{"filter_midpoint": 530, "filter_width": 30}]}],
    })
    inst_id = inst_resp.json()["id"]

    resp = client.delete("/api/v1/instruments/%s" % inst_id)
    assert resp.status_code == 204

    resp2 = client.get("/api/v1/instruments/%s" % inst_id)
    assert resp2.status_code == 404
