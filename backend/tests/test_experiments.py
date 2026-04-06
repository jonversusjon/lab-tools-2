from __future__ import annotations


# --- Helper functions ---

def _create_experiment(client, name="Test Experiment", description=None):
    payload = {"name": name}
    if description is not None:
        payload["description"] = description
    resp = client.post("/api/v1/experiments", json=payload)
    assert resp.status_code == 201
    return resp.json()


def _create_block(client, experiment_id, block_type="paragraph", content=None, sort_order=0.0, parent_id=None):
    payload = {
        "block_type": block_type,
        "content": content or {"text": "Hello"},
        "sort_order": sort_order,
    }
    if parent_id is not None:
        payload["parent_id"] = parent_id
    resp = client.post("/api/v1/experiments/%s/blocks" % experiment_id, json=payload)
    return resp


# --- Experiment CRUD ---

def test_create_experiment(client):
    exp = _create_experiment(client, "My Experiment", "A description")
    assert exp["name"] == "My Experiment"
    assert exp["description"] == "A description"
    assert "id" in exp
    assert exp["blocks"] == []


def test_create_experiment_no_description(client):
    exp = _create_experiment(client)
    assert exp["description"] is None


def test_list_experiments(client):
    _create_experiment(client, "Exp A")
    _create_experiment(client, "Exp B")
    resp = client.get("/api/v1/experiments")
    assert resp.status_code == 200
    data = resp.json()
    assert data["total"] == 2
    names = [e["name"] for e in data["items"]]
    assert "Exp A" in names
    assert "Exp B" in names


def test_list_experiments_block_count(client):
    exp = _create_experiment(client, "Exp With Blocks")
    _create_block(client, exp["id"], sort_order=0.0)
    _create_block(client, exp["id"], sort_order=1.0)
    resp = client.get("/api/v1/experiments")
    data = resp.json()
    item = [e for e in data["items"] if e["id"] == exp["id"]][0]
    assert item["block_count"] == 2


def test_get_experiment(client):
    exp = _create_experiment(client, "Detail Test")
    resp = client.get("/api/v1/experiments/%s" % exp["id"])
    assert resp.status_code == 200
    assert resp.json()["name"] == "Detail Test"


def test_get_experiment_not_found(client):
    resp = client.get("/api/v1/experiments/nonexistent")
    assert resp.status_code == 404


def test_get_experiment_blocks_sorted(client):
    exp = _create_experiment(client)
    _create_block(client, exp["id"], sort_order=2.0, content={"text": "Second"})
    _create_block(client, exp["id"], sort_order=1.0, content={"text": "First"})
    resp = client.get("/api/v1/experiments/%s" % exp["id"])
    blocks = resp.json()["blocks"]
    assert len(blocks) == 2
    assert blocks[0]["content"]["text"] == "First"
    assert blocks[1]["content"]["text"] == "Second"


def test_update_experiment(client):
    exp = _create_experiment(client, "Original")
    resp = client.put(
        "/api/v1/experiments/%s" % exp["id"],
        json={"name": "Updated"},
    )
    assert resp.status_code == 200
    assert resp.json()["name"] == "Updated"


def test_update_experiment_partial(client):
    exp = _create_experiment(client, "Name", "Desc")
    resp = client.put(
        "/api/v1/experiments/%s" % exp["id"],
        json={"description": "New Desc"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "Name"
    assert data["description"] == "New Desc"


def test_delete_experiment(client):
    exp = _create_experiment(client)
    resp = client.delete("/api/v1/experiments/%s" % exp["id"])
    assert resp.status_code == 204
    resp = client.get("/api/v1/experiments/%s" % exp["id"])
    assert resp.status_code == 404


def test_delete_experiment_cascades_blocks(client):
    exp = _create_experiment(client)
    _create_block(client, exp["id"], sort_order=0.0)
    _create_block(client, exp["id"], sort_order=1.0)
    resp = client.delete("/api/v1/experiments/%s" % exp["id"])
    assert resp.status_code == 204


# --- Block CRUD ---

def test_create_block(client):
    exp = _create_experiment(client)
    resp = _create_block(client, exp["id"], "heading_1", {"text": "Title"}, 0.0)
    assert resp.status_code == 201
    block = resp.json()
    assert block["block_type"] == "heading_1"
    assert block["content"]["text"] == "Title"
    assert block["sort_order"] == 0.0
    assert block["parent_id"] is None


def test_create_block_with_parent(client):
    exp = _create_experiment(client)
    parent = _create_block(client, exp["id"], "heading_1", {"text": "Toggle", "is_toggleable": True}, 0.0).json()
    child = _create_block(client, exp["id"], "paragraph", {"text": "Child"}, 0.5, parent["id"])
    assert child.status_code == 201
    assert child.json()["parent_id"] == parent["id"]


def test_create_block_invalid_experiment(client):
    resp = _create_block(client, "nonexistent", sort_order=0.0)
    assert resp.status_code == 404


def test_create_block_parent_wrong_experiment(client):
    exp_a = _create_experiment(client, "A")
    exp_b = _create_experiment(client, "B")
    block_a = _create_block(client, exp_a["id"], sort_order=0.0).json()
    resp = _create_block(client, exp_b["id"], sort_order=0.0, parent_id=block_a["id"])
    assert resp.status_code == 400


def test_update_block(client):
    exp = _create_experiment(client)
    block = _create_block(client, exp["id"], "paragraph", {"text": "Old"}, 0.0).json()
    resp = client.put(
        "/api/v1/experiments/%s/blocks/%s" % (exp["id"], block["id"]),
        json={"content": {"text": "New"}},
    )
    assert resp.status_code == 200
    assert resp.json()["content"]["text"] == "New"
    assert resp.json()["block_type"] == "paragraph"


def test_update_block_type(client):
    exp = _create_experiment(client)
    block = _create_block(client, exp["id"], "paragraph", {"text": "Convert me"}, 0.0).json()
    resp = client.put(
        "/api/v1/experiments/%s/blocks/%s" % (exp["id"], block["id"]),
        json={"block_type": "heading_1"},
    )
    assert resp.status_code == 200
    assert resp.json()["block_type"] == "heading_1"


def test_update_block_wrong_experiment(client):
    exp_a = _create_experiment(client, "A")
    exp_b = _create_experiment(client, "B")
    block = _create_block(client, exp_a["id"], sort_order=0.0).json()
    resp = client.put(
        "/api/v1/experiments/%s/blocks/%s" % (exp_b["id"], block["id"]),
        json={"content": {"text": "Sneaky"}},
    )
    assert resp.status_code == 404


def test_delete_block(client):
    exp = _create_experiment(client)
    block = _create_block(client, exp["id"], sort_order=0.0).json()
    resp = client.delete(
        "/api/v1/experiments/%s/blocks/%s" % (exp["id"], block["id"]),
    )
    assert resp.status_code == 204
    exp_data = client.get("/api/v1/experiments/%s" % exp["id"]).json()
    assert len(exp_data["blocks"]) == 0


def test_delete_parent_block_orphans_children(client):
    exp = _create_experiment(client)
    parent = _create_block(client, exp["id"], "heading_1", {"text": "Parent"}, 0.0).json()
    child = _create_block(client, exp["id"], "paragraph", {"text": "Child"}, 1.0, parent["id"]).json()
    client.delete("/api/v1/experiments/%s/blocks/%s" % (exp["id"], parent["id"]))
    exp_data = client.get("/api/v1/experiments/%s" % exp["id"]).json()
    assert len(exp_data["blocks"]) == 1
    assert exp_data["blocks"][0]["id"] == child["id"]
    assert exp_data["blocks"][0]["parent_id"] is None


# --- Block Reorder ---

def test_reorder_blocks(client):
    exp = _create_experiment(client)
    b1 = _create_block(client, exp["id"], "paragraph", {"text": "A"}, 0.0).json()
    b2 = _create_block(client, exp["id"], "paragraph", {"text": "B"}, 1.0).json()
    b3 = _create_block(client, exp["id"], "paragraph", {"text": "C"}, 2.0).json()
    # Move C to the top
    resp = client.put(
        "/api/v1/experiments/%s/blocks/reorder" % exp["id"],
        json={"blocks": [
            {"id": b3["id"], "sort_order": -1.0, "parent_id": None},
            {"id": b1["id"], "sort_order": 0.0, "parent_id": None},
            {"id": b2["id"], "sort_order": 1.0, "parent_id": None},
        ]},
    )
    assert resp.status_code == 200
    blocks = resp.json()["blocks"]
    assert blocks[0]["content"]["text"] == "C"
    assert blocks[1]["content"]["text"] == "A"
    assert blocks[2]["content"]["text"] == "B"


def test_reorder_partial(client):
    """Partial reorder — only sending some blocks is valid."""
    exp = _create_experiment(client)
    b1 = _create_block(client, exp["id"], "paragraph", {"text": "A"}, 0.0).json()
    _create_block(client, exp["id"], "paragraph", {"text": "B"}, 1.0)
    resp = client.put(
        "/api/v1/experiments/%s/blocks/reorder" % exp["id"],
        json={"blocks": [
            {"id": b1["id"], "sort_order": 5.0, "parent_id": None},
        ]},
    )
    assert resp.status_code == 200


def test_reorder_block_wrong_experiment(client):
    exp_a = _create_experiment(client, "A")
    exp_b = _create_experiment(client, "B")
    block = _create_block(client, exp_a["id"], sort_order=0.0).json()
    resp = client.put(
        "/api/v1/experiments/%s/blocks/reorder" % exp_b["id"],
        json={"blocks": [{"id": block["id"], "sort_order": 0.0, "parent_id": None}]},
    )
    assert resp.status_code == 400


# --- Snapshot ---

def test_snapshot_flow_panel(client):
    """Create a flow panel with targets and assignments, then snapshot it."""
    inst_resp = client.get("/api/v1/instruments")
    inst = inst_resp.json()["items"][0]
    panel = client.post("/api/v1/panels", json={"name": "Flow Template", "instrument_id": inst["id"]}).json()

    # Add a target
    ab_resp = client.get("/api/v1/antibodies")
    ab = ab_resp.json()["items"][0]
    client.post("/api/v1/panels/%s/targets" % panel["id"], json={"antibody_id": ab["id"]})

    # Add an assignment
    fl_resp = client.get("/api/v1/fluorophores")
    fl = fl_resp.json()["items"][0]
    det_id = inst["lasers"][0]["detectors"][0]["id"]
    client.post("/api/v1/panels/%s/assignments" % panel["id"], json={
        "antibody_id": ab["id"],
        "fluorophore_id": fl["id"],
        "detector_id": det_id,
    })

    # Create experiment and snapshot
    exp = _create_experiment(client, "Snapshot Test")
    resp = client.post(
        "/api/v1/experiments/%s/snapshot-panel" % exp["id"],
        json={"source_panel_id": panel["id"], "panel_type": "flow"},
    )
    assert resp.status_code == 201
    block = resp.json()
    assert block["block_type"] == "flow_panel"
    content = block["content"]
    assert content["source_panel_id"] == panel["id"]
    assert content["name"] == "Flow Template"
    assert content["instrument"] is not None
    assert content["instrument"]["name"] == inst["name"]
    assert len(content["targets"]) == 1
    assert content["targets"][0]["antibody_id"] == ab["id"]
    assert len(content["assignments"]) == 1
    assert content["assignments"][0]["fluorophore_id"] == fl["id"]
    assert content["volume_params"]["dilution_source"] == "flow"


def test_snapshot_flow_panel_no_instrument(client):
    """Snapshot a flow panel with no instrument assigned."""
    panel = client.post("/api/v1/panels", json={"name": "No Inst"}).json()
    exp = _create_experiment(client)
    resp = client.post(
        "/api/v1/experiments/%s/snapshot-panel" % exp["id"],
        json={"source_panel_id": panel["id"], "panel_type": "flow"},
    )
    assert resp.status_code == 201
    assert resp.json()["content"]["instrument"] is None


def test_snapshot_if_panel(client, db_session):
    """Create an IF panel with a microscope, then snapshot it."""
    from models import Microscope
    from models import MicroscopeFilter
    from models import MicroscopeLaser

    # Create microscope directly in DB for test
    scope = Microscope(name="Test Confocal")
    db_session.add(scope)
    db_session.flush()
    laser = MicroscopeLaser(
        microscope_id=scope.id,
        wavelength_nm=488,
        name="488nm Laser",
    )
    db_session.add(laser)
    db_session.flush()
    filt = MicroscopeFilter(
        laser_id=laser.id,
        filter_midpoint=525,
        filter_width=50,
        name="525/50",
    )
    db_session.add(filt)
    db_session.commit()

    # Create IF panel via API
    if_panel = client.post("/api/v1/if-panels", json={
        "name": "IF Template",
        "panel_type": "IF",
        "microscope_id": scope.id,
    }).json()

    # Add a target
    ab_resp = client.get("/api/v1/antibodies")
    ab = ab_resp.json()["items"][0]
    client.post("/api/v1/if-panels/%s/targets" % if_panel["id"], json={
        "antibody_id": ab["id"],
    })

    # Add an assignment
    fl_resp = client.get("/api/v1/fluorophores")
    fl = fl_resp.json()["items"][0]
    client.post("/api/v1/if-panels/%s/assignments" % if_panel["id"], json={
        "antibody_id": ab["id"],
        "fluorophore_id": fl["id"],
        "filter_id": filt.id,
    })

    # Snapshot
    exp = _create_experiment(client, "IF Snapshot Test")
    resp = client.post(
        "/api/v1/experiments/%s/snapshot-panel" % exp["id"],
        json={"source_panel_id": if_panel["id"], "panel_type": "if"},
    )
    assert resp.status_code == 201
    block = resp.json()
    assert block["block_type"] == "if_panel"
    content = block["content"]
    assert content["source_panel_id"] == if_panel["id"]
    assert content["panel_type"] == "IF"
    assert content["microscope"] is not None
    assert content["microscope"]["name"] == "Test Confocal"
    assert len(content["targets"]) == 1
    assert len(content["assignments"]) == 1
    assert content["volume_params"]["dilution_source"] == "icc_if"


def test_snapshot_nonexistent_panel(client):
    exp = _create_experiment(client)
    resp = client.post(
        "/api/v1/experiments/%s/snapshot-panel" % exp["id"],
        json={"source_panel_id": "nonexistent", "panel_type": "flow"},
    )
    assert resp.status_code == 404


def test_snapshot_invalid_panel_type(client):
    exp = _create_experiment(client)
    resp = client.post(
        "/api/v1/experiments/%s/snapshot-panel" % exp["id"],
        json={"source_panel_id": "whatever", "panel_type": "invalid"},
    )
    assert resp.status_code == 400


def test_snapshot_nonexistent_experiment(client):
    resp = client.post(
        "/api/v1/experiments/nonexistent/snapshot-panel",
        json={"source_panel_id": "whatever", "panel_type": "flow"},
    )
    assert resp.status_code == 404


def test_snapshot_adds_to_end(client):
    """Snapshot block sort_order should be after existing blocks."""
    exp = _create_experiment(client)
    _create_block(client, exp["id"], sort_order=0.0)
    _create_block(client, exp["id"], sort_order=5.0)

    panel = client.post("/api/v1/panels", json={"name": "P"}).json()
    resp = client.post(
        "/api/v1/experiments/%s/snapshot-panel" % exp["id"],
        json={"source_panel_id": panel["id"], "panel_type": "flow"},
    )
    block = resp.json()
    assert block["sort_order"] > 5.0


def test_content_json_roundtrip(client):
    """Verify JSON content survives create → read roundtrip intact."""
    exp = _create_experiment(client)
    content = {
        "table_width": 3,
        "has_column_header": True,
        "has_row_header": False,
        "rows": [
            ["Header 1", "Header 2", "Header 3"],
            ["Cell A", "Cell B", "Cell C"],
        ],
    }
    block = _create_block(client, exp["id"], "table", content, 0.0).json()
    assert block["content"] == content

    # Re-fetch via experiment detail
    exp_data = client.get("/api/v1/experiments/%s" % exp["id"]).json()
    assert exp_data["blocks"][0]["content"] == content
