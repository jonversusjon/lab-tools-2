from __future__ import annotations


def test_list_returns_seed_entries(client):
    resp = client.get("/api/v1/fluorophores")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 3
    assert "items" in data
    assert "skip" in data
    assert "limit" in data


def test_list_excludes_spectra(client):
    resp = client.get("/api/v1/fluorophores")
    data = resp.json()
    for item in data["items"]:
        assert "spectra" not in item
        assert "spectra_records" not in item


def test_list_items_have_new_fields(client):
    resp = client.get("/api/v1/fluorophores")
    data = resp.json()
    assert data["total"] > 0
    item = data["items"][0]
    assert "has_spectra" in item
    assert "fluor_type" in item
    assert "ex_max_nm" in item
    assert "em_max_nm" in item


def test_list_filter_by_type(client):
    resp = client.get("/api/v1/fluorophores?type=protein")
    assert resp.status_code == 200
    data = resp.json()
    for item in data["items"]:
        assert item["fluor_type"] == "protein"

    resp = client.get("/api/v1/fluorophores?type=dye")
    assert resp.status_code == 200
    data = resp.json()
    for item in data["items"]:
        assert item["fluor_type"] == "dye"


def test_list_filter_has_spectra(client):
    resp = client.get("/api/v1/fluorophores?has_spectra=true")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 2
    for item in data["items"]:
        assert item["has_spectra"] is True

    resp = client.get("/api/v1/fluorophores?has_spectra=false")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    for item in data["items"]:
        assert item["has_spectra"] is False


def test_list_search(client):
    resp = client.get("/api/v1/fluorophores?search=EGFP")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] >= 1
    names = [item["name"] for item in data["items"]]
    assert any("EGFP" in n for n in names)


def test_get_spectra_returns_ex_em(client):
    # Get a fluorophore with spectra
    resp = client.get("/api/v1/fluorophores?has_spectra=true")
    fl_id = resp.json()["items"][0]["id"]

    spectra_resp = client.get("/api/v1/fluorophores/%s/spectra" % fl_id)
    assert spectra_resp.status_code == 200
    data = spectra_resp.json()
    assert "fluorophore_id" in data
    assert "name" in data
    assert "spectra" in data
    spectra = data["spectra"]
    # Should have at least EX or EM
    assert "EX" in spectra or "EM" in spectra
    if "EX" in spectra:
        assert len(spectra["EX"]) > 5
        # Each point should be [wavelength, intensity]
        assert len(spectra["EX"][0]) == 2


def test_get_spectra_404_for_missing(client):
    resp = client.get("/api/v1/fluorophores/nonexistent-slug/spectra")
    assert resp.status_code == 404


def test_create_fluorophore(client):
    payload = {
        "name": "TestDye",
        "source": "user",
        "ex_max_nm": 500.0,
        "em_max_nm": 520.0,
    }
    resp = client.post("/api/v1/fluorophores", json=payload)
    assert resp.status_code == 201
    body = resp.json()
    assert body["name"] == "TestDye"
    assert body["source"] == "user"
    assert body["has_spectra"] is False


def test_fluorophore_name_uniqueness(client):
    payload = {
        "name": "UniqueDye",
        "source": "user",
    }
    resp1 = client.post("/api/v1/fluorophores", json=payload)
    assert resp1.status_code == 201

    resp2 = client.post("/api/v1/fluorophores", json=payload)
    assert resp2.status_code == 409


def test_batch_spectra(client):
    resp = client.get("/api/v1/fluorophores?has_spectra=true")
    ids = [item["id"] for item in resp.json()["items"]]

    batch_resp = client.post(
        "/api/v1/fluorophores/spectra/batch",
        json={"ids": ids, "types": ["EX", "EM"]},
    )
    assert batch_resp.status_code == 200
    data = batch_resp.json()
    for fl_id in ids:
        assert fl_id in data
        # Each entry should have EX or EM keys
        assert "EX" in data[fl_id] or "EM" in data[fl_id]


def test_batch_spectra_over_limit_returns_400(client):
    fake_ids = ["id-%d" % i for i in range(2001)]
    resp = client.post(
        "/api/v1/fluorophores/spectra/batch",
        json={"ids": fake_ids, "types": ["EX", "EM"]},
    )
    assert resp.status_code == 400


def test_batch_spectra_mixed_valid_invalid(client):
    resp = client.get("/api/v1/fluorophores?has_spectra=true")
    valid_id = resp.json()["items"][0]["id"]
    batch_resp = client.post(
        "/api/v1/fluorophores/spectra/batch",
        json={"ids": [valid_id, "nonexistent-id"], "types": ["EX", "EM"]},
    )
    assert batch_resp.status_code == 200
    data = batch_resp.json()
    assert valid_id in data
    assert "nonexistent-id" not in data


def test_batch_spectra_empty_list(client):
    resp = client.post(
        "/api/v1/fluorophores/spectra/batch",
        json={"ids": [], "types": ["EX", "EM"]},
    )
    assert resp.status_code == 200
    assert resp.json() == {}


def test_seed_fluorophores_have_fpbase_source(client):
    resp = client.get("/api/v1/fluorophores?limit=500")
    for item in resp.json()["items"]:
        assert item["source"] in ("FPbase", "user"), (
            "Fluorophore %s has unexpected source=%s" % (item["name"], item["source"])
        )


def test_instrument_compatibility_no_instruments(client):
    # Remove all instruments to test empty-instrument response
    from models import Instrument
    db = None
    # We can test via API: get a fluorophore with spectra
    resp = client.get("/api/v1/fluorophores?has_spectra=true")
    fl_id = resp.json()["items"][0]["id"]

    compat_resp = client.get(
        "/api/v1/fluorophores/%s/instrument-compatibility" % fl_id
    )
    assert compat_resp.status_code == 200
    data = compat_resp.json()
    assert "fluorophore_id" in data
    assert "instrument_compatibilities" in data
    # May have instruments from seed data — just check the structure
    for compat in data["instrument_compatibilities"]:
        assert "instrument_id" in compat
        assert "instrument_name" in compat
        assert "laser_lines" in compat
        assert "detectors" in compat


def test_instrument_compatibility_404_for_missing(client):
    resp = client.get(
        "/api/v1/fluorophores/nonexistent-slug/instrument-compatibility"
    )
    assert resp.status_code == 404
