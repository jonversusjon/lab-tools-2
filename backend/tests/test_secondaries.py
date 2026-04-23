from __future__ import annotations


def test_list_secondary_antibodies(client):
    resp = client.get("/api/v1/secondary-antibodies")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


def test_create_secondary_antibody(client):
    resp = client.post(
        "/api/v1/secondary-antibodies",
        json={
            "name": "Donkey anti-Goat IgG AF594",
            "host": "Donkey",
            "target_species": "Goat",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Donkey anti-Goat IgG AF594"
    assert data["host"] == "Donkey"
    assert data["target_species"] == "Goat"
    assert isinstance(data["id"], str)
    assert len(data["id"]) == 36


def test_create_secondary_with_fluorophore(client):
    resp = client.post(
        "/api/v1/secondary-antibodies",
        json={
            "name": "Goat anti-Rat IgG AF488",
            "host": "Goat",
            "target_species": "Rat",
            "fluorophore_id": "test-egfp",
        },
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["fluorophore_id"] == "test-egfp"
    assert data["fluorophore_name"] == "EGFP"


def test_create_secondary_nonexistent_fluorophore(client):
    resp = client.post(
        "/api/v1/secondary-antibodies",
        json={
            "name": "Bad secondary",
            "host": "Goat",
            "target_species": "Mouse",
            "fluorophore_id": "nonexistent",
        },
    )
    assert resp.status_code == 404


def test_get_secondary_antibody(client):
    resp = client.get("/api/v1/secondary-antibodies/test-secondary-with-fluor")
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Goat anti-Mouse IgG AF488"
    assert data["fluorophore_name"] == "EGFP"


def test_get_nonexistent_secondary(client):
    resp = client.get("/api/v1/secondary-antibodies/nonexistent")
    assert resp.status_code == 404


def test_update_secondary_antibody(client):
    resp = client.put(
        "/api/v1/secondary-antibodies/test-secondary-no-fluor",
        json={
            "name": "Goat anti-Rabbit IgG Updated",
            "host": "Goat",
            "target_species": "Rabbit",
            "fluorophore_id": "test-mcherry",
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Goat anti-Rabbit IgG Updated"
    assert data["fluorophore_id"] == "test-mcherry"
    assert data["fluorophore_name"] == "mCherry"


def test_delete_secondary_antibody(client):
    resp = client.delete("/api/v1/secondary-antibodies/test-secondary-no-fluor")
    assert resp.status_code == 204

    resp = client.get("/api/v1/secondary-antibodies/test-secondary-no-fluor")
    assert resp.status_code == 404


def test_filter_by_host(client):
    resp = client.get("/api/v1/secondary-antibodies?host=Goat")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2  # both seed secondaries are Goat


def test_filter_by_target_species(client):
    resp = client.get("/api/v1/secondary-antibodies?target_species=Mouse")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert data["items"][0]["target_species"] == "Mouse"


def test_search_secondary(client):
    resp = client.get("/api/v1/secondary-antibodies?search=Rabbit")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 1
    assert "Rabbit" in data["items"][0]["name"]


def test_import_confirm_savepoint_isolates_row_failures(client):
    """Row 2 failure must not roll back rows 1 and 3 (BUG-001)."""
    resp = client.post(
        "/api/v1/secondary-antibodies/import-confirm",
        json={
            "items": [
                {
                    "name": "Import Row One",
                    "host": "Goat",
                    "target_species": "Mouse",
                    "row_number": 2,
                },
                {
                    # Bad FK triggers IntegrityError on flush
                    "name": "Import Row Two",
                    "host": "Goat",
                    "target_species": "Rabbit",
                    "fluorophore_id": "does-not-exist",
                    "row_number": 3,
                },
                {
                    "name": "Import Row Three",
                    "host": "Donkey",
                    "target_species": "Rat",
                    "row_number": 4,
                },
            ],
        },
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["created"] == 2
    assert len(data["errors"]) == 1
    assert "Row 3" in data["errors"][0]

    listing = client.get("/api/v1/secondary-antibodies?search=Import").json()
    names = {item["name"] for item in listing["items"]}
    assert "Import Row One" in names
    assert "Import Row Three" in names
    assert "Import Row Two" not in names
