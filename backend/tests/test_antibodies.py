from __future__ import annotations


def test_list_returns_seed_entries(client):
    resp = client.get("/api/v1/antibodies")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 10
    assert "items" in data
    assert "skip" in data
    assert "limit" in data


def test_crud_cycle(client):
    # Create
    payload = {"target": "CD20", "clone": "2H7", "host": "mouse", "isotype": "IgG1"}
    resp = client.post("/api/v1/antibodies", json=payload)
    assert resp.status_code == 201
    ab_id = resp.json()["id"]

    # Read
    resp2 = client.get("/api/v1/antibodies/%s" % ab_id)
    assert resp2.status_code == 200
    assert resp2.json()["target"] == "CD20"

    # Update
    resp3 = client.put("/api/v1/antibodies/%s" % ab_id, json={
        "target": "CD20", "clone": "2H7", "host": "mouse", "isotype": "IgG2b",
    })
    assert resp3.status_code == 200
    assert resp3.json()["isotype"] == "IgG2b"

    # Delete
    resp4 = client.delete("/api/v1/antibodies/%s" % ab_id)
    assert resp4.status_code == 204

    resp5 = client.get("/api/v1/antibodies/%s" % ab_id)
    assert resp5.status_code == 404


def test_create_with_fluorophore_id(client):
    fl_resp = client.get("/api/v1/fluorophores")
    fl_id = fl_resp.json()["items"][0]["id"]
    fl_name = fl_resp.json()["items"][0]["name"]

    resp = client.post("/api/v1/antibodies", json={
        "target": "CD3", "clone": "OKT3-conj", "fluorophore_id": fl_id,
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["fluorophore_id"] == fl_id
    assert data["fluorophore_name"] == fl_name


def test_create_without_fluorophore_id(client):
    resp = client.post("/api/v1/antibodies", json={"target": "CD99"})
    assert resp.status_code == 201
    assert resp.json()["fluorophore_id"] is None


def test_delete_antibody_cascades_to_panel_target(client):
    # Create antibody
    ab_resp = client.post("/api/v1/antibodies", json={"target": "CD99"})
    ab_id = ab_resp.json()["id"]

    # Create panel and add target
    panel_resp = client.post("/api/v1/panels", json={"name": "P1"})
    panel_id = panel_resp.json()["id"]
    client.post("/api/v1/panels/%s/targets" % panel_id, json={"antibody_id": ab_id})

    # Delete antibody — should cascade
    client.delete("/api/v1/antibodies/%s" % ab_id)

    panel = client.get("/api/v1/panels/%s" % panel_id).json()
    assert len(panel["targets"]) == 0
