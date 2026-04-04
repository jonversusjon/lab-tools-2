from __future__ import annotations


def test_create_plate_map(client):
    resp = client.post(
        "/api/v1/plate-maps",
        json={"name": "Test Plate", "plate_type": "96-well", "well_data": {}, "legend": {}},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Test Plate"
    assert data["plate_type"] == "96-well"
    assert isinstance(data["well_data"], dict)
    assert isinstance(data["legend"], dict)
    assert "id" in data


def test_list_plate_maps(client):
    client.post("/api/v1/plate-maps", json={"name": "Plate A", "plate_type": "96-well"})
    client.post("/api/v1/plate-maps", json={"name": "Plate B", "plate_type": "384-well"})

    resp = client.get("/api/v1/plate-maps")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    names = [item["name"] for item in data["items"]]
    assert "Plate A" in names
    assert "Plate B" in names
    # List response should not contain well_data / legend
    for item in data["items"]:
        assert "well_data" not in item
        assert "legend" not in item


def test_get_plate_map(client):
    create_resp = client.post(
        "/api/v1/plate-maps",
        json={"name": "My Plate", "plate_type": "24-well", "well_data": {}, "legend": {}},
    )
    pm_id = create_resp.json()["id"]

    resp = client.get("/api/v1/plate-maps/%s" % pm_id)
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == pm_id
    assert data["plate_type"] == "24-well"
    assert isinstance(data["well_data"], dict)
    assert isinstance(data["legend"], dict)


def test_update_plate_map_well_data(client):
    create_resp = client.post(
        "/api/v1/plate-maps",
        json={"name": "Update Test", "plate_type": "96-well", "well_data": {}, "legend": {}},
    )
    pm_id = create_resp.json()["id"]

    new_well_data = {
        "A1": {"fillColor": "#3b82f6"},
        "A2": {"fillColor": "#ef4444", "borderColor": "#000000"},
    }
    resp = client.put(
        "/api/v1/plate-maps/%s" % pm_id,
        json={"well_data": new_well_data},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["well_data"] == new_well_data


def test_well_data_persisted_correctly(client):
    create_resp = client.post(
        "/api/v1/plate-maps",
        json={"name": "Persist Test", "plate_type": "96-well", "well_data": {}, "legend": {}},
    )
    pm_id = create_resp.json()["id"]

    new_well_data = {"B3": {"fillColor": "#10b981"}, "C5": {"borderColor": "#6366f1"}}
    client.put("/api/v1/plate-maps/%s" % pm_id, json={"well_data": new_well_data})

    resp = client.get("/api/v1/plate-maps/%s" % pm_id)
    assert resp.status_code == 200
    assert resp.json()["well_data"] == new_well_data


def test_delete_plate_map(client):
    create_resp = client.post(
        "/api/v1/plate-maps",
        json={"name": "Delete Me", "plate_type": "6-well"},
    )
    pm_id = create_resp.json()["id"]

    resp = client.delete("/api/v1/plate-maps/%s" % pm_id)
    assert resp.status_code == 204


def test_get_deleted_plate_map_returns_404(client):
    create_resp = client.post(
        "/api/v1/plate-maps",
        json={"name": "Gone", "plate_type": "96-well"},
    )
    pm_id = create_resp.json()["id"]
    client.delete("/api/v1/plate-maps/%s" % pm_id)

    resp = client.get("/api/v1/plate-maps/%s" % pm_id)
    assert resp.status_code == 404
