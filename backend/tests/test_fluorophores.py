from __future__ import annotations


def test_list_returns_seed_entries(client):
    resp = client.get("/api/v1/fluorophores")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 48
    assert "items" in data
    assert "skip" in data
    assert "limit" in data


def test_list_excludes_spectra(client):
    resp = client.get("/api/v1/fluorophores")
    data = resp.json()
    for item in data["items"]:
        assert "spectra" not in item


def test_get_spectra_returns_arrays(client):
    # Get a fluorophore ID
    resp = client.get("/api/v1/fluorophores")
    fl_id = resp.json()["items"][0]["id"]

    spectra_resp = client.get("/api/v1/fluorophores/%s/spectra" % fl_id)
    assert spectra_resp.status_code == 200
    data = spectra_resp.json()
    assert "spectra" in data
    assert "excitation" in data["spectra"]
    assert "emission" in data["spectra"]
    assert len(data["spectra"]["excitation"]) > 10
    assert len(data["spectra"]["emission"]) > 10


def test_create_fluorophore(client):
    payload = {
        "name": "TestDye",
        "excitation_max_nm": 500,
        "emission_max_nm": 520,
        "source": "user",
    }
    resp = client.post("/api/v1/fluorophores", json=payload)
    assert resp.status_code == 201
    assert resp.json()["name"] == "TestDye"


def test_fluorophore_name_uniqueness(client):
    payload = {
        "name": "UniqueDye",
        "excitation_max_nm": 500,
        "emission_max_nm": 520,
        "source": "user",
    }
    resp1 = client.post("/api/v1/fluorophores", json=payload)
    assert resp1.status_code == 201

    resp2 = client.post("/api/v1/fluorophores", json=payload)
    assert resp2.status_code == 409


def test_batch_spectra(client):
    resp = client.get("/api/v1/fluorophores")
    ids = [item["id"] for item in resp.json()["items"][:3]]

    batch_resp = client.post("/api/v1/fluorophores/batch-spectra", json={"ids": ids})
    assert batch_resp.status_code == 200
    data = batch_resp.json()
    for fl_id in ids:
        assert fl_id in data


def test_batch_spectra_over_100_returns_400(client):
    fake_ids = ["id-%d" % i for i in range(101)]
    resp = client.post("/api/v1/fluorophores/batch-spectra", json={"ids": fake_ids})
    assert resp.status_code == 400


def test_batch_spectra_mixed_valid_invalid(client):
    resp = client.get("/api/v1/fluorophores")
    valid_id = resp.json()["items"][0]["id"]
    batch_resp = client.post("/api/v1/fluorophores/batch-spectra", json={
        "ids": [valid_id, "nonexistent-id"],
    })
    assert batch_resp.status_code == 200
    data = batch_resp.json()
    assert valid_id in data
    assert "nonexistent-id" not in data


def test_batch_spectra_empty_list(client):
    resp = client.post("/api/v1/fluorophores/batch-spectra", json={"ids": []})
    assert resp.status_code == 200
    assert resp.json() == {}


def test_seed_fluorophores_have_source_seed(client):
    resp = client.get("/api/v1/fluorophores?limit=500")
    for item in resp.json()["items"]:
        assert item["source"] == "seed", (
            "Fluorophore %s has source=%s, expected seed" % (item["name"], item["source"])
        )
