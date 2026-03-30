from __future__ import annotations


def test_get_empty_list(client):
    resp = client.get("/api/v1/list-entries/host")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


def test_create_and_get(client):
    resp = client.post("/api/v1/list-entries/host", json={"value": "Goat"})
    assert resp.status_code == 201
    entry = resp.json()
    assert entry["value"] == "Goat"
    assert entry["list_type"] == "host"
    assert isinstance(entry["id"], str)

    entries = client.get("/api/v1/list-entries/host").json()
    assert any(e["value"] == "Goat" for e in entries)


def test_create_duplicate_exact(client):
    client.post("/api/v1/list-entries/host", json={"value": "Mouse"})
    resp = client.post("/api/v1/list-entries/host", json={"value": "Mouse"})
    assert resp.status_code == 409
    assert "Already exists: Mouse" in resp.json()["detail"]


def test_create_duplicate_case_insensitive(client):
    client.post("/api/v1/list-entries/host", json={"value": "Mouse"})
    resp = client.post("/api/v1/list-entries/host", json={"value": "mouse"})
    assert resp.status_code == 409
    assert "Already exists: Mouse" in resp.json()["detail"]


def test_create_duplicate_fuzzy(client):
    client.post("/api/v1/list-entries/target_species", json={"value": "Armenian Hamster"})
    resp = client.post("/api/v1/list-entries/target_species", json={"value": "Armenian Hamstr"})
    assert resp.status_code == 409
    assert "Armenian Hamster" in resp.json()["detail"]


def test_update_entry(client):
    resp = client.post("/api/v1/list-entries/host", json={"value": "Gooat"})
    entry_id = resp.json()["id"]
    resp = client.put(
        "/api/v1/list-entries/host/" + entry_id,
        json={"value": "Goat"},
    )
    assert resp.status_code == 200
    assert resp.json()["value"] == "Goat"


def test_update_rename_collision(client):
    client.post("/api/v1/list-entries/host", json={"value": "Mouse"})
    resp = client.post("/api/v1/list-entries/host", json={"value": "Rat"})
    entry_id = resp.json()["id"]
    resp = client.put(
        "/api/v1/list-entries/host/" + entry_id,
        json={"value": "Mouse"},
    )
    assert resp.status_code == 409


def test_delete_entry(client):
    resp = client.post("/api/v1/list-entries/host", json={"value": "Chicken"})
    entry_id = resp.json()["id"]
    resp = client.delete("/api/v1/list-entries/host/" + entry_id)
    assert resp.status_code == 204

    entries = client.get("/api/v1/list-entries/host").json()
    assert not any(e["value"] == "Chicken" for e in entries)


def test_invalid_list_type(client):
    resp = client.get("/api/v1/list-entries/invalid_type")
    assert resp.status_code == 400


def test_empty_value_rejected(client):
    resp = client.post("/api/v1/list-entries/host", json={"value": "  "})
    assert resp.status_code == 400


def test_different_list_types_independent(client):
    client.post("/api/v1/list-entries/host", json={"value": "Mouse"})
    resp = client.post("/api/v1/list-entries/target_species", json={"value": "Mouse"})
    assert resp.status_code == 201


def test_readd_after_delete(client):
    resp = client.post("/api/v1/list-entries/host", json={"value": "Donkey"})
    entry_id = resp.json()["id"]
    client.delete("/api/v1/list-entries/host/" + entry_id)
    resp = client.post("/api/v1/list-entries/host", json={"value": "Donkey"})
    assert resp.status_code == 201
    assert resp.json()["id"] != entry_id
