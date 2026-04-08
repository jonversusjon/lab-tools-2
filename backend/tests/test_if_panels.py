from __future__ import annotations


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _create_microscope(client, name="Test Scope"):
    resp = client.post(
        "/api/v1/microscopes/",
        json={
            "name": name,
            "lasers": [
                {
                    "wavelength_nm": 488,
                    "name": "488nm Laser",
                    "filters": [
                        {"filter_midpoint": 525, "filter_width": 50, "name": "GFP"},
                    ],
                }
            ],
        },
    )
    assert resp.status_code == 201
    return resp.json()


def _create_antibody(client, target="GFAP", name="GFAP Ab"):
    resp = client.post("/api/v1/antibodies/", json={"target": target, "name": name})
    assert resp.status_code == 201
    return resp.json()


def _create_panel(client, name="Test IF Panel", **kwargs):
    payload = {"name": name, **kwargs}
    resp = client.post("/api/v1/if-panels/", json=payload)
    assert resp.status_code == 201
    return resp.json()


def _add_target(client, panel_id, antibody_id, staining_mode="direct"):
    resp = client.post(
        "/api/v1/if-panels/%s/targets" % panel_id,
        json={"antibody_id": antibody_id, "staining_mode": staining_mode},
    )
    assert resp.status_code == 201
    return resp.json()


def _add_assignment(client, panel_id, antibody_id, fluorophore_id="test-egfp", filter_id=None):
    payload = {"antibody_id": antibody_id, "fluorophore_id": fluorophore_id}
    if filter_id is not None:
        payload["filter_id"] = filter_id
    resp = client.post("/api/v1/if-panels/%s/assignments" % panel_id, json=payload)
    assert resp.status_code == 201
    return resp.json()


# ---------------------------------------------------------------------------
# Panel CRUD
# ---------------------------------------------------------------------------


def test_create_panel_defaults(client):
    data = _create_panel(client)
    assert data["name"] == "Test IF Panel"
    assert data["panel_type"] == "IF"
    assert data["view_mode"] == "simple"
    assert data["microscope_id"] is None
    assert data["targets"] == []
    assert data["assignments"] == []


def test_create_panel_with_microscope(client):
    microscope = _create_microscope(client)
    data = _create_panel(client, microscope_id=microscope["id"])
    assert data["microscope_id"] == microscope["id"]


def test_create_panel_with_invalid_microscope(client):
    resp = client.post(
        "/api/v1/if-panels/",
        json={"name": "Bad Panel", "microscope_id": "does-not-exist"},
    )
    assert resp.status_code == 404


def test_get_panel(client):
    panel = _create_panel(client)
    resp = client.get("/api/v1/if-panels/%s" % panel["id"])
    assert resp.status_code == 200
    data = resp.json()
    assert "targets" in data
    assert "assignments" in data


def test_get_nonexistent_panel(client):
    resp = client.get("/api/v1/if-panels/does-not-exist")
    assert resp.status_code == 404


def test_list_panels(client):
    _create_panel(client, name="Panel A")
    _create_panel(client, name="Panel B")
    resp = client.get("/api/v1/if-panels/")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    assert len(data["items"]) == 2


def test_update_partial_fields(client):
    panel = _create_panel(client, name="Original Name")
    resp = client.put(
        "/api/v1/if-panels/%s" % panel["id"],
        json={"view_mode": "spectral"},
    )
    assert resp.status_code == 200
    data = resp.json()
    # view_mode changed
    assert data["view_mode"] == "spectral"
    # name preserved
    assert data["name"] == "Original Name"


def test_delete_panel(client):
    panel = _create_panel(client)
    resp = client.delete("/api/v1/if-panels/%s" % panel["id"])
    assert resp.status_code == 204
    get_resp = client.get("/api/v1/if-panels/%s" % panel["id"])
    assert get_resp.status_code == 404


def test_delete_nonexistent_panel(client):
    resp = client.delete("/api/v1/if-panels/does-not-exist")
    assert resp.status_code == 404


# ---------------------------------------------------------------------------
# Microscope change clears filter-linked assignments only
# ---------------------------------------------------------------------------


def test_update_microscope_clears_filter_linked_assignments(client):
    scope_a = _create_microscope(client, name="Scope A")
    scope_b = _create_microscope(client, name="Scope B")
    filter_id = scope_a["lasers"][0]["filters"][0]["id"]

    ab1 = _create_antibody(client, target="GFAP", name="GFAP Ab")
    ab2 = _create_antibody(client, target="NeuN", name="NeuN Ab")

    panel = _create_panel(client, microscope_id=scope_a["id"])
    panel_id = panel["id"]

    _add_target(client, panel_id, ab1["id"])
    _add_target(client, panel_id, ab2["id"])

    # Assignment WITH filter_id (from scope A)
    _add_assignment(client, panel_id, ab1["id"], filter_id=filter_id)
    # Assignment WITHOUT filter_id
    _add_assignment(client, panel_id, ab2["id"], fluorophore_id="test-mcherry")

    # Change microscope to scope B
    resp = client.put(
        "/api/v1/if-panels/%s" % panel_id,
        json={"microscope_id": scope_b["id"]},
    )
    assert resp.status_code == 200
    data = resp.json()

    assignment_ab_ids = {a["antibody_id"] for a in data["assignments"]}
    # Filter-linked assignment should be gone
    assert ab1["id"] not in assignment_ab_ids
    # Filter-null assignment should survive
    assert ab2["id"] in assignment_ab_ids


# ---------------------------------------------------------------------------
# Targets
# ---------------------------------------------------------------------------


def test_add_target(client):
    panel = _create_panel(client)
    ab = _create_antibody(client)
    target = _add_target(client, panel["id"], ab["id"])
    assert target["antibody_id"] == ab["id"]
    assert target["staining_mode"] == "direct"


def test_add_target_duplicate_returns_409(client):
    panel = _create_panel(client)
    ab = _create_antibody(client)
    _add_target(client, panel["id"], ab["id"])
    resp = client.post(
        "/api/v1/if-panels/%s/targets" % panel["id"],
        json={"antibody_id": ab["id"], "staining_mode": "direct"},
    )
    assert resp.status_code == 409


def test_reorder_targets(client):
    panel = _create_panel(client)
    ab1 = _create_antibody(client, target="GFAP")
    ab2 = _create_antibody(client, target="NeuN")
    ab3 = _create_antibody(client, target="Iba1")

    t1 = _add_target(client, panel["id"], ab1["id"])
    t2 = _add_target(client, panel["id"], ab2["id"])
    t3 = _add_target(client, panel["id"], ab3["id"])

    # Reverse the order
    new_order = [t3["id"], t2["id"], t1["id"]]
    resp = client.put(
        "/api/v1/if-panels/%s/targets/reorder" % panel["id"],
        json={"target_ids": new_order},
    )
    assert resp.status_code == 200
    reordered = resp.json()
    assert [t["id"] for t in reordered] == new_order


def test_reorder_targets_missing_id_returns_400(client):
    panel = _create_panel(client)
    ab = _create_antibody(client)
    t = _add_target(client, panel["id"], ab["id"])
    # Provide wrong IDs
    resp = client.put(
        "/api/v1/if-panels/%s/targets/reorder" % panel["id"],
        json={"target_ids": ["wrong-id"]},
    )
    assert resp.status_code == 400


def test_update_target_staining_mode(client):
    panel = _create_panel(client)
    ab = _create_antibody(client)
    target = _add_target(client, panel["id"], ab["id"])

    resp = client.put(
        "/api/v1/if-panels/%s/targets/%s" % (panel["id"], target["id"]),
        json={"staining_mode": "indirect"},
    )
    assert resp.status_code == 200
    assert resp.json()["staining_mode"] == "indirect"


def test_remove_target_cascades_assignment(client):
    panel = _create_panel(client)
    ab = _create_antibody(client)
    target = _add_target(client, panel["id"], ab["id"])
    _add_assignment(client, panel["id"], ab["id"])

    # Verify assignment exists
    get_resp = client.get("/api/v1/if-panels/%s" % panel["id"])
    assert len(get_resp.json()["assignments"]) == 1

    # Delete target
    del_resp = client.delete(
        "/api/v1/if-panels/%s/targets/%s" % (panel["id"], target["id"])
    )
    assert del_resp.status_code == 204

    # Assignment should be gone too
    get_resp2 = client.get("/api/v1/if-panels/%s" % panel["id"])
    assert get_resp2.json()["assignments"] == []
    assert get_resp2.json()["targets"] == []


# ---------------------------------------------------------------------------
# Assignments
# ---------------------------------------------------------------------------


def test_add_assignment_simple_no_filter(client):
    panel = _create_panel(client)
    ab = _create_antibody(client)
    _add_target(client, panel["id"], ab["id"])

    assignment = _add_assignment(client, panel["id"], ab["id"])
    assert assignment["antibody_id"] == ab["id"]
    assert assignment["fluorophore_id"] == "test-egfp"
    assert assignment["filter_id"] is None


def test_add_assignment_spectral_with_filter(client):
    microscope = _create_microscope(client)
    filter_id = microscope["lasers"][0]["filters"][0]["id"]
    panel = _create_panel(client, microscope_id=microscope["id"])
    ab = _create_antibody(client)
    _add_target(client, panel["id"], ab["id"])

    assignment = _add_assignment(client, panel["id"], ab["id"], filter_id=filter_id)
    assert assignment["filter_id"] == filter_id


def test_add_assignment_with_invalid_filter(client):
    """Filter from a different microscope should return 400."""
    scope_a = _create_microscope(client, name="Scope A")
    scope_b = _create_microscope(client, name="Scope B")
    wrong_filter_id = scope_b["lasers"][0]["filters"][0]["id"]

    panel = _create_panel(client, microscope_id=scope_a["id"])
    ab = _create_antibody(client)
    _add_target(client, panel["id"], ab["id"])

    resp = client.post(
        "/api/v1/if-panels/%s/assignments" % panel["id"],
        json={
            "antibody_id": ab["id"],
            "fluorophore_id": "test-egfp",
            "filter_id": wrong_filter_id,
        },
    )
    assert resp.status_code == 400


def test_add_assignment_requires_target_first(client):
    """Assigning an antibody that isn't a target returns 400."""
    panel = _create_panel(client)
    ab = _create_antibody(client)
    # Don't add as target

    resp = client.post(
        "/api/v1/if-panels/%s/assignments" % panel["id"],
        json={"antibody_id": ab["id"], "fluorophore_id": "test-egfp"},
    )
    assert resp.status_code == 400


def test_add_assignment_duplicate_antibody_returns_409(client):
    panel = _create_panel(client)
    ab = _create_antibody(client)
    _add_target(client, panel["id"], ab["id"])
    _add_assignment(client, panel["id"], ab["id"])

    resp = client.post(
        "/api/v1/if-panels/%s/assignments" % panel["id"],
        json={"antibody_id": ab["id"], "fluorophore_id": "test-mcherry"},
    )
    assert resp.status_code == 409


def test_remove_assignment(client):
    panel = _create_panel(client)
    ab = _create_antibody(client)
    _add_target(client, panel["id"], ab["id"])
    assignment = _add_assignment(client, panel["id"], ab["id"])

    resp = client.delete(
        "/api/v1/if-panels/%s/assignments/%s" % (panel["id"], assignment["id"])
    )
    assert resp.status_code == 204

    # Gone from panel
    get_resp = client.get("/api/v1/if-panels/%s" % panel["id"])
    assert get_resp.json()["assignments"] == []


# ---------------------------------------------------------------------------
# Dilution override
# ---------------------------------------------------------------------------


def test_target_includes_antibody_icc_if_dilution(client):
    """_target_to_read includes antibody_icc_if_dilution from the antibody record."""
    # Create antibody with icc_if_dilution
    resp = client.post(
        "/api/v1/antibodies/",
        json={"target": "GFAP", "name": "GFAP Ab", "icc_if_dilution": "1:200"},
    )
    assert resp.status_code == 201
    ab = resp.json()

    panel = _create_panel(client)
    target = _add_target(client, panel["id"], ab["id"])

    assert target["antibody_icc_if_dilution"] == "1:200"
    assert target["dilution_override"] is None


def test_update_target_dilution_override(client):
    """Setting dilution_override persists and is returned."""
    panel = _create_panel(client)
    ab = _create_antibody(client)
    target = _add_target(client, panel["id"], ab["id"])

    resp = client.put(
        "/api/v1/if-panels/%s/targets/%s" % (panel["id"], target["id"]),
        json={"dilution_override": "1:500"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["dilution_override"] == "1:500"


def test_update_target_clear_dilution_override(client):
    """Explicitly sending dilution_override: null resets the override."""
    panel = _create_panel(client)
    ab = _create_antibody(client)
    target = _add_target(client, panel["id"], ab["id"])

    # First set an override
    client.put(
        "/api/v1/if-panels/%s/targets/%s" % (panel["id"], target["id"]),
        json={"dilution_override": "1:500"},
    )

    # Then clear it
    resp = client.put(
        "/api/v1/if-panels/%s/targets/%s" % (panel["id"], target["id"]),
        json={"dilution_override": None},
    )
    assert resp.status_code == 200
    assert resp.json()["dilution_override"] is None


# --- Phase B: Polymorphic Targets ---


def test_add_dye_label_target_if(client):
    """POST a dye_label target to IF panel — response includes dye_label_name."""
    panel = _create_panel(client)

    resp = client.post(
        "/api/v1/if-panels/%s/targets" % panel["id"],
        json={"dye_label_id": "test-dye-label-with-fluor"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["dye_label_id"] == "test-dye-label-with-fluor"
    assert data["dye_label_name"] == "MitoSOX Red"
    assert data["dye_label_target"] == "Mitochondrial Superoxide"
    assert data["antibody_id"] is None
    assert data["staining_mode"] == "direct"


def test_add_dye_label_target_if_forces_direct(client):
    """Indirect mode is forced to direct for dye_label targets in IF panel."""
    panel = _create_panel(client)

    resp = client.post(
        "/api/v1/if-panels/%s/targets" % panel["id"],
        json={"dye_label_id": "test-dye-label-with-fluor", "staining_mode": "indirect"},
    )
    assert resp.status_code == 201
    assert resp.json()["staining_mode"] == "direct"


def test_dye_label_target_if_duplicate_409(client):
    """Adding same dye_label twice to IF panel returns 409."""
    panel = _create_panel(client)

    client.post("/api/v1/if-panels/%s/targets" % panel["id"], json={"dye_label_id": "test-dye-label-with-fluor"})
    resp = client.post("/api/v1/if-panels/%s/targets" % panel["id"], json={"dye_label_id": "test-dye-label-with-fluor"})
    assert resp.status_code == 409


def test_both_antibody_and_dye_label_400_if(client):
    """POST with both antibody_id and dye_label_id to IF panel returns 400."""
    panel = _create_panel(client)
    ab = _create_antibody(client)

    resp = client.post(
        "/api/v1/if-panels/%s/targets" % panel["id"],
        json={"antibody_id": ab["id"], "dye_label_id": "test-dye-label-with-fluor"},
    )
    assert resp.status_code == 400


def test_assign_dye_label_fluorophore_if(client):
    """Create dye_label target in IF panel, then create assignment."""
    panel = _create_panel(client)

    client.post("/api/v1/if-panels/%s/targets" % panel["id"], json={"dye_label_id": "test-dye-label-with-fluor"})

    resp = client.post(
        "/api/v1/if-panels/%s/assignments" % panel["id"],
        json={"dye_label_id": "test-dye-label-with-fluor", "fluorophore_id": "test-egfp"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["dye_label_id"] == "test-dye-label-with-fluor"
    assert data["antibody_id"] is None


def test_remove_dye_label_target_cascades_assignment_if(client):
    """Removing dye_label target from IF panel also removes its assignment."""
    panel = _create_panel(client)

    target_resp = client.post(
        "/api/v1/if-panels/%s/targets" % panel["id"],
        json={"dye_label_id": "test-dye-label-with-fluor"},
    )
    target_id = target_resp.json()["id"]

    client.post(
        "/api/v1/if-panels/%s/assignments" % panel["id"],
        json={"dye_label_id": "test-dye-label-with-fluor", "fluorophore_id": "test-egfp"},
    )

    resp = client.delete("/api/v1/if-panels/%s/targets/%s" % (panel["id"], target_id))
    assert resp.status_code == 204

    panel_data = client.get("/api/v1/if-panels/%s" % panel["id"]).json()
    assert len(panel_data["targets"]) == 0
    assert len(panel_data["assignments"]) == 0
