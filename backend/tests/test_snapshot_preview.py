from __future__ import annotations

import copy


def _strip_instance_ids(attrs):
    """Remove the per-row random UUIDs so two snapshots can be compared.

    The serializer mints a fresh str(uuid4()) for every target/assignment
    instance id on each call, so those differ between any two invocations even
    for the same template. Everything else must be identical.
    """
    out = copy.deepcopy(attrs)
    for row in out.get("targets", []):
        row.pop("id", None)
    for row in out.get("assignments", []):
        row.pop("id", None)
    return out


def _make_flow_panel(client):
    inst = client.get("/api/v1/instruments").json()["items"][0]
    panel = client.post(
        "/api/v1/panels", json={"name": "Flow Template", "instrument_id": inst["id"]}
    ).json()
    ab = client.get("/api/v1/antibodies").json()["items"][0]
    client.post("/api/v1/panels/%s/targets" % panel["id"], json={"antibody_id": ab["id"]})
    fl = client.get("/api/v1/fluorophores").json()["items"][0]
    det_id = inst["lasers"][0]["detectors"][0]["id"]
    client.post(
        "/api/v1/panels/%s/assignments" % panel["id"],
        json={"antibody_id": ab["id"], "fluorophore_id": fl["id"], "detector_id": det_id},
    )
    return panel, ab, fl


def test_flow_snapshot_preview_shape(client):
    panel, ab, fl = _make_flow_panel(client)
    resp = client.get("/api/v1/panels/%s/snapshot-preview" % panel["id"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "flow_panel"
    attrs = body["attrs"]
    assert attrs["source_panel_id"] == panel["id"]
    assert attrs["name"] == "Flow Template"
    assert attrs["instrument"] is not None
    assert len(attrs["targets"]) == 1
    assert attrs["targets"][0]["antibody_id"] == ab["id"]
    assert len(attrs["assignments"]) == 1
    assert attrs["assignments"][0]["fluorophore_id"] == fl["id"]
    assert attrs["volume_params"]["dilution_source"] == "flow"


def test_flow_snapshot_preview_no_db_write(client):
    """Calling the preview endpoint must not create any blocks."""
    panel, _ab, _fl = _make_flow_panel(client)
    exp = client.post("/api/v1/experiments", json={"name": "Empty"}).json()
    client.get("/api/v1/panels/%s/snapshot-preview" % panel["id"])
    fetched = client.get("/api/v1/experiments/%s" % exp["id"]).json()
    assert fetched["blocks"] == []


def test_flow_snapshot_preview_matches_persisted_snapshot(client):
    """Preview JSON is byte-identical (modulo per-row ids) to what
    snapshot-panel embeds for the same template."""
    panel, _ab, _fl = _make_flow_panel(client)
    preview = client.get("/api/v1/panels/%s/snapshot-preview" % panel["id"]).json()

    exp = client.post("/api/v1/experiments", json={"name": "Snap"}).json()
    block = client.post(
        "/api/v1/experiments/%s/snapshot-panel" % exp["id"],
        json={"source_panel_id": panel["id"], "panel_type": "flow"},
    ).json()

    assert preview["type"] == block["block_type"]
    assert _strip_instance_ids(preview["attrs"]) == _strip_instance_ids(block["content"])


def test_flow_snapshot_preview_not_found(client):
    resp = client.get("/api/v1/panels/nonexistent/snapshot-preview")
    assert resp.status_code == 404


def _make_if_panel(client, db_session):
    from models import Microscope
    from models import MicroscopeFilter
    from models import MicroscopeLaser

    scope = Microscope(name="Test Confocal")
    db_session.add(scope)
    db_session.flush()
    laser = MicroscopeLaser(microscope_id=scope.id, wavelength_nm=488, name="488nm Laser")
    db_session.add(laser)
    db_session.flush()
    filt = MicroscopeFilter(
        laser_id=laser.id, filter_midpoint=525, filter_width=50, name="525/50"
    )
    db_session.add(filt)
    db_session.commit()

    if_panel = client.post(
        "/api/v1/if-panels",
        json={"name": "IF Template", "panel_type": "IF", "microscope_id": scope.id},
    ).json()
    ab = client.get("/api/v1/antibodies").json()["items"][0]
    client.post(
        "/api/v1/if-panels/%s/targets" % if_panel["id"], json={"antibody_id": ab["id"]}
    )
    fl = client.get("/api/v1/fluorophores").json()["items"][0]
    client.post(
        "/api/v1/if-panels/%s/assignments" % if_panel["id"],
        json={"antibody_id": ab["id"], "fluorophore_id": fl["id"], "filter_id": filt.id},
    )
    return if_panel, ab, fl


def test_if_snapshot_preview_shape(client, db_session):
    if_panel, ab, fl = _make_if_panel(client, db_session)
    resp = client.get("/api/v1/if-panels/%s/snapshot-preview" % if_panel["id"])
    assert resp.status_code == 200
    body = resp.json()
    assert body["type"] == "if_panel"
    attrs = body["attrs"]
    assert attrs["source_panel_id"] == if_panel["id"]
    assert attrs["panel_type"] == "IF"
    assert attrs["microscope"] is not None
    assert attrs["microscope"]["name"] == "Test Confocal"
    assert len(attrs["targets"]) == 1
    assert len(attrs["assignments"]) == 1
    assert attrs["volume_params"]["dilution_source"] == "icc_if"


def test_if_snapshot_preview_matches_persisted_snapshot(client, db_session):
    if_panel, _ab, _fl = _make_if_panel(client, db_session)
    preview = client.get(
        "/api/v1/if-panels/%s/snapshot-preview" % if_panel["id"]
    ).json()

    exp = client.post("/api/v1/experiments", json={"name": "Snap IF"}).json()
    block = client.post(
        "/api/v1/experiments/%s/snapshot-panel" % exp["id"],
        json={"source_panel_id": if_panel["id"], "panel_type": "if"},
    ).json()

    assert preview["type"] == block["block_type"]
    assert _strip_instance_ids(preview["attrs"]) == _strip_instance_ids(block["content"])


def test_if_snapshot_preview_not_found(client):
    resp = client.get("/api/v1/if-panels/nonexistent/snapshot-preview")
    assert resp.status_code == 404
