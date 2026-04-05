from __future__ import annotations


MICROSCOPE_PAYLOAD = {
    "name": "Test Confocal",
    "lasers": [
        {
            "wavelength_nm": 488,
            "name": "488nm Laser",
            "filters": [
                {"filter_midpoint": 525, "filter_width": 50, "name": "GFP"},
                {"filter_midpoint": 595, "filter_width": 50, "name": "mCherry"},
            ],
        },
        {
            "wavelength_nm": 638,
            "name": "638nm Laser",
            "filters": [
                {"filter_midpoint": 680, "filter_width": 40, "name": "AF647"},
            ],
        },
    ],
}


def _create_microscope(client, payload=None):
    if payload is None:
        payload = MICROSCOPE_PAYLOAD
    resp = client.post("/api/v1/microscopes/", json=payload)
    assert resp.status_code == 201
    return resp.json()


# ---------- list ----------


def test_list_empty(client):
    resp = client.get("/api/v1/microscopes/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["items"] == []
    assert data["total"] == 0


# ---------- create ----------


def test_create_microscope(client):
    data = _create_microscope(client)
    assert data["name"] == "Test Confocal"
    assert len(data["lasers"]) == 2
    first_laser = next(l for l in data["lasers"] if l["wavelength_nm"] == 488)
    assert len(first_laser["filters"]) == 2
    filter_names = [f["name"] for f in first_laser["filters"]]
    assert "GFP" in filter_names


# ---------- get ----------


def test_get_microscope_by_id(client):
    created = _create_microscope(client)
    resp = client.get("/api/v1/microscopes/%s" % created["id"])
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == created["id"]
    assert data["name"] == "Test Confocal"
    # All lasers and filters present
    total_filters = sum(len(l["filters"]) for l in data["lasers"])
    assert total_filters == 3


def test_get_nonexistent_microscope(client):
    resp = client.get("/api/v1/microscopes/does-not-exist")
    assert resp.status_code == 404


# ---------- update ----------


def test_update_microscope(client):
    created = _create_microscope(client)
    update_payload = {
        "name": "Updated Confocal",
        "lasers": [
            {
                "wavelength_nm": 405,
                "name": "405nm Laser",
                "filters": [
                    {"filter_midpoint": 450, "filter_width": 60, "name": "DAPI"},
                ],
            }
        ],
    }
    resp = client.put("/api/v1/microscopes/%s" % created["id"], json=update_payload)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Updated Confocal"
    assert len(data["lasers"]) == 1
    assert data["lasers"][0]["wavelength_nm"] == 405


def test_update_nonexistent_microscope(client):
    resp = client.put(
        "/api/v1/microscopes/does-not-exist",
        json={"name": "Foo", "lasers": []},
    )
    assert resp.status_code == 404


def test_update_blocked_by_in_use_filter(client):
    """PUT should return 409 when a filter is referenced by an IF panel assignment."""
    microscope = _create_microscope(client)
    filter_id = microscope["lasers"][0]["filters"][0]["id"]

    # Create an antibody and fluorophore for the assignment
    ab_resp = client.post(
        "/api/v1/antibodies/",
        json={"target": "MAP2", "name": "MAP2 Ab"},
    )
    assert ab_resp.status_code == 201
    ab_id = ab_resp.json()["id"]

    # Create an IF panel linked to this microscope
    panel_resp = client.post(
        "/api/v1/if-panels/",
        json={"name": "Test Panel", "microscope_id": microscope["id"]},
    )
    assert panel_resp.status_code == 201
    panel_id = panel_resp.json()["id"]

    # Add the antibody as a target
    target_resp = client.post(
        "/api/v1/if-panels/%s/targets" % panel_id,
        json={"antibody_id": ab_id, "staining_mode": "direct"},
    )
    assert target_resp.status_code == 201

    # Add an assignment that references the filter
    assign_resp = client.post(
        "/api/v1/if-panels/%s/assignments" % panel_id,
        json={
            "antibody_id": ab_id,
            "fluorophore_id": "test-egfp",
            "filter_id": filter_id,
        },
    )
    assert assign_resp.status_code == 201

    # Now try to update the microscope — should be blocked
    update_payload = {"name": "Blocked Update", "lasers": []}
    resp = client.put("/api/v1/microscopes/%s" % microscope["id"], json=update_payload)
    assert resp.status_code == 409


# ---------- delete ----------


def test_delete_microscope(client):
    created = _create_microscope(client)
    resp = client.delete("/api/v1/microscopes/%s" % created["id"])
    assert resp.status_code == 204

    # Subsequent GET returns 404
    get_resp = client.get("/api/v1/microscopes/%s" % created["id"])
    assert get_resp.status_code == 404


def test_delete_nonexistent_microscope(client):
    resp = client.delete("/api/v1/microscopes/does-not-exist")
    assert resp.status_code == 404


# ---------- favorite toggle ----------


def test_favorite_toggle(client):
    created = _create_microscope(client)
    assert created["is_favorite"] is False

    resp = client.patch(
        "/api/v1/microscopes/%s/favorite" % created["id"],
        json={"is_favorite": True},
    )
    assert resp.status_code == 200
    assert resp.json()["is_favorite"] is True

    # Toggle back
    resp2 = client.patch(
        "/api/v1/microscopes/%s/favorite" % created["id"],
        json={"is_favorite": False},
    )
    assert resp2.status_code == 200
    assert resp2.json()["is_favorite"] is False


def test_favorite_toggle_nonexistent(client):
    resp = client.patch(
        "/api/v1/microscopes/does-not-exist/favorite",
        json={"is_favorite": True},
    )
    assert resp.status_code == 404


# ---------- export / import ----------


def test_export_microscope(client):
    created = _create_microscope(client)
    resp = client.get("/api/v1/microscopes/%s/export" % created["id"])
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Test Confocal"
    assert len(data["lasers"]) == 2
    # Export should NOT include id fields
    assert "id" not in data


def test_import_microscope(client):
    created = _create_microscope(client)
    export_resp = client.get("/api/v1/microscopes/%s/export" % created["id"])
    export_data = export_resp.json()

    # Import creates a new microscope
    import_resp = client.post("/api/v1/microscopes/import", json=export_data)
    assert import_resp.status_code == 201
    imported = import_resp.json()
    assert imported["name"] == export_data["name"]
    assert imported["id"] != created["id"]  # new record
    assert len(imported["lasers"]) == len(created["lasers"])


def test_list_after_create(client):
    _create_microscope(client)
    _create_microscope(client, {**MICROSCOPE_PAYLOAD, "name": "Second Scope"})
    resp = client.get("/api/v1/microscopes/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2
