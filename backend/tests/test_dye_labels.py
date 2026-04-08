from __future__ import annotations


def test_create_dye_label(client):
    resp = client.post(
        "/api/v1/dye-labels",
        json={
            "name": "DAPI",
            "label_target": "Nuclei",
            "category": "nucleic acid",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "DAPI"
    assert data["label_target"] == "Nuclei"
    assert data["category"] == "nucleic acid"
    assert data["fluorophore_name"] is None
    assert isinstance(data["id"], str)
    assert len(data["id"]) == 36


def test_create_dye_label_with_fluorophore(client):
    resp = client.post(
        "/api/v1/dye-labels",
        json={
            "name": "MitoSOX Red",
            "label_target": "Mitochondrial Superoxide",
            "category": "organelle",
            "fluorophore_id": "test-mcherry",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["fluorophore_id"] == "test-mcherry"
    assert data["fluorophore_name"] == "mCherry"


def test_create_duplicate_name_409(client):
    client.post(
        "/api/v1/dye-labels",
        json={"name": "DAPI", "label_target": "Nuclei"},
    )
    resp = client.post(
        "/api/v1/dye-labels",
        json={"name": "DAPI", "label_target": "Nuclei"},
    )
    assert resp.status_code == 409


def test_list_dye_labels(client):
    client.post("/api/v1/dye-labels", json={"name": "DAPI", "label_target": "Nuclei"})
    client.post("/api/v1/dye-labels", json={"name": "Hoechst 33342", "label_target": "Nuclei"})
    client.post("/api/v1/dye-labels", json={"name": "7-AAD", "label_target": "Viability"})

    resp = client.get("/api/v1/dye-labels")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 3
    assert len(data["items"]) == 3
    assert "skip" in data
    assert "limit" in data


def test_list_dye_labels_search(client):
    client.post("/api/v1/dye-labels", json={"name": "DAPI", "label_target": "Nuclei", "category": "nucleic acid"})
    client.post("/api/v1/dye-labels", json={"name": "MitoSOX Red", "label_target": "Mitochondrial Superoxide", "category": "organelle"})

    resp = client.get("/api/v1/dye-labels?search=nuclei")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["name"] == "DAPI"


def test_get_dye_label(client):
    create_resp = client.post(
        "/api/v1/dye-labels",
        json={"name": "Propidium Iodide", "label_target": "Viability", "category": "viability"},
    )
    dl_id = create_resp.json()["id"]

    resp = client.get("/api/v1/dye-labels/" + dl_id)
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Propidium Iodide"
    assert data["category"] == "viability"


def test_get_nonexistent_dye_label(client):
    resp = client.get("/api/v1/dye-labels/nonexistent-id")
    assert resp.status_code == 404


def test_update_dye_label(client):
    create_resp = client.post(
        "/api/v1/dye-labels",
        json={"name": "CellTrace Violet", "label_target": "Cell Proliferation"},
    )
    dl_id = create_resp.json()["id"]

    resp = client.put(
        "/api/v1/dye-labels/" + dl_id,
        json={
            "name": "CellTrace Violet",
            "label_target": "Cell Proliferation",
            "category": "cell tracking",
            "vendor": "Thermo Fisher",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["category"] == "cell tracking"
    assert data["vendor"] == "Thermo Fisher"


def test_delete_dye_label(client):
    create_resp = client.post(
        "/api/v1/dye-labels",
        json={"name": "Calcein AM", "label_target": "Viability (live cells)"},
    )
    dl_id = create_resp.json()["id"]

    resp = client.delete("/api/v1/dye-labels/" + dl_id)
    assert resp.status_code == 204

    resp = client.get("/api/v1/dye-labels/" + dl_id)
    assert resp.status_code == 404


def test_toggle_favorite(client):
    create_resp = client.post(
        "/api/v1/dye-labels",
        json={"name": "Annexin V", "label_target": "Apoptosis"},
    )
    dl_id = create_resp.json()["id"]
    assert create_resp.json()["is_favorite"] is False

    resp = client.patch("/api/v1/dye-labels/" + dl_id + "/favorite", json={"is_favorite": True})
    assert resp.status_code == 200
    assert resp.json()["is_favorite"] is True

    resp = client.patch("/api/v1/dye-labels/" + dl_id + "/favorite", json={"is_favorite": False})
    assert resp.status_code == 200
    assert resp.json()["is_favorite"] is False


def test_dilution_factor_parsing(client):
    resp = client.post(
        "/api/v1/dye-labels",
        json={
            "name": "MitoTracker Deep Red",
            "label_target": "Mitochondria",
            "flow_dilution": "1:200",
            "icc_if_dilution": "1:500",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["flow_dilution_factor"] == 200
    assert data["icc_if_dilution_factor"] == 500


def test_create_nonexistent_fluorophore_404(client):
    resp = client.post(
        "/api/v1/dye-labels",
        json={
            "name": "Bad Dye",
            "label_target": "Nuclei",
            "fluorophore_id": "nonexistent-fluorophore",
        },
    )
    assert resp.status_code == 404
