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


# ---------------------------------------------------------------------------
# Duplicate / 409 guard
# ---------------------------------------------------------------------------

def test_create_duplicate_name_catalog_returns_409(client):
    """POSTing the same (name, catalog_number) twice must yield 409 with a
    message that mentions duplication so callers can surface a meaningful error."""
    payload = {
        "target": "CD20",
        "name": "Anti-CD20 PE",
        "catalog_number": "555622",
        "vendor": "BD Biosciences",
    }
    r1 = client.post("/api/v1/antibodies", json=payload)
    assert r1.status_code == 201, r1.text

    r2 = client.post("/api/v1/antibodies", json=payload)
    assert r2.status_code == 409, r2.text
    detail = r2.json()["detail"].lower()
    assert "already exists" in detail or "duplicate" in detail, (
        f"Expected duplication language in detail, got: {r2.json()['detail']!r}"
    )


# ---------------------------------------------------------------------------
# Full-shape round-trip (schema drift guard)
# ---------------------------------------------------------------------------

def test_create_full_shape_all_nullable_fields_explicit(client):
    """POST with every field the AntibodyForm actually sends — including all
    nullable fields set to None — to catch schema drift between frontend and
    backend.  The response must echo every scalar field back."""
    payload = {
        # Required
        "target": "CD45",
        # Optional strings — sent explicitly as null by the form
        "name": None,
        "clone": None,
        "host": None,
        "isotype": None,
        "fluorophore_id": None,
        "conjugate": None,
        "vendor": None,
        "catalog_number": None,
        "date_received": None,
        # Dilution strings
        "flow_dilution": None,
        "icc_if_dilution": None,
        "wb_dilution": None,
        # Dilution factors (integers)
        "flow_dilution_factor": None,
        "icc_if_dilution_factor": None,
        "wb_dilution_factor": None,
        # Misc nullable
        "storage_temp": None,
        "validation_notes": None,
        "notes": None,
        "website": None,
        "physical_location": None,
        "reacts_with": None,
        # Boolean with explicit value
        "confirmed_in_stock": False,
    }
    resp = client.post("/api/v1/antibodies", json=payload)
    assert resp.status_code == 201, resp.text

    data = resp.json()
    assert data["target"] == "CD45"
    # Every nullable field that was sent as null should come back as null
    for field in (
        "name", "clone", "host", "isotype", "fluorophore_id", "conjugate",
        "vendor", "catalog_number", "date_received",
        "flow_dilution", "icc_if_dilution", "wb_dilution",
        "flow_dilution_factor", "icc_if_dilution_factor", "wb_dilution_factor",
        "storage_temp", "validation_notes", "notes", "website",
        "physical_location", "reacts_with",
    ):
        assert data[field] is None, (
            f"Expected {field!r} to be null in response, got {data[field]!r}"
        )
    assert data["confirmed_in_stock"] is False
    # Sanity-check the response also has the read-only fields
    assert "id" in data
    assert "created_at" in data
    assert "updated_at" in data
    assert "tags" in data
