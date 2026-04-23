from __future__ import annotations

"""Verify all API routes resolve at their expected full paths.
Catches double-prefix bugs where router files accidentally include a prefix,
and catches silent unregistration when a router is dropped from main.py."""

from main import app

EXPECTED_ROUTES = [
    # Instruments
    ("GET", "/api/v1/instruments"),
    ("POST", "/api/v1/instruments"),
    ("GET", "/api/v1/instruments/recent"),
    ("POST", "/api/v1/instruments/import"),
    ("GET", "/api/v1/instruments/{id}"),
    ("PUT", "/api/v1/instruments/{id}"),
    ("DELETE", "/api/v1/instruments/{id}"),
    ("GET", "/api/v1/instruments/{id}/export"),
    ("GET", "/api/v1/instruments/{id}/fluorophore-compatibility"),
    ("PATCH", "/api/v1/instruments/{id}/favorite"),
    ("POST", "/api/v1/instruments/{id}/view"),
    # Fluorophores
    ("GET", "/api/v1/fluorophores"),
    ("POST", "/api/v1/fluorophores"),
    ("GET", "/api/v1/fluorophores/recent"),
    ("GET", "/api/v1/fluorophores/fpbase-catalog"),
    ("GET", "/api/v1/fluorophores/{id}/spectra"),
    ("GET", "/api/v1/fluorophores/{id}/instrument-compatibility"),
    ("GET", "/api/v1/fluorophores/{id}/microscope-compatibility"),
    ("PATCH", "/api/v1/fluorophores/{id}/favorite"),
    ("POST", "/api/v1/fluorophores/fetch-fpbase"),
    ("POST", "/api/v1/fluorophores/batch-fetch-fpbase"),
    ("POST", "/api/v1/fluorophores/spectra/batch"),
    ("POST", "/api/v1/fluorophores/import/upload"),
    ("POST", "/api/v1/fluorophores/import/confirm"),
    # Antibodies
    ("GET", "/api/v1/antibodies"),
    ("POST", "/api/v1/antibodies"),
    ("GET", "/api/v1/antibodies/{id}"),
    ("PUT", "/api/v1/antibodies/{id}"),
    ("DELETE", "/api/v1/antibodies/{id}"),
    ("PATCH", "/api/v1/antibodies/{id}/favorite"),
    ("POST", "/api/v1/antibodies/{id}/tags"),
    ("DELETE", "/api/v1/antibodies/{id}/tags/{tag_id}"),
    ("POST", "/api/v1/antibodies/import-csv"),
    ("POST", "/api/v1/antibodies/import-confirm"),
    # Flow Panels
    ("GET", "/api/v1/panels"),
    ("POST", "/api/v1/panels"),
    ("GET", "/api/v1/panels/{id}"),
    ("PUT", "/api/v1/panels/{id}"),
    ("DELETE", "/api/v1/panels/{id}"),
    ("POST", "/api/v1/panels/{id}/targets"),
    ("PUT", "/api/v1/panels/{id}/targets/reorder"),
    ("PUT", "/api/v1/panels/{id}/targets/{target_id}"),
    ("DELETE", "/api/v1/panels/{id}/targets/{target_id}"),
    ("POST", "/api/v1/panels/{id}/assignments"),
    ("DELETE", "/api/v1/panels/{id}/assignments/{assignment_id}"),
    # IF Panels
    ("GET", "/api/v1/if-panels"),
    ("POST", "/api/v1/if-panels"),
    ("GET", "/api/v1/if-panels/{id}"),
    ("PUT", "/api/v1/if-panels/{id}"),
    ("DELETE", "/api/v1/if-panels/{id}"),
    ("POST", "/api/v1/if-panels/{id}/targets"),
    ("PUT", "/api/v1/if-panels/{id}/targets/reorder"),
    ("PUT", "/api/v1/if-panels/{id}/targets/{target_id}"),
    ("DELETE", "/api/v1/if-panels/{id}/targets/{target_id}"),
    ("POST", "/api/v1/if-panels/{id}/assignments"),
    ("DELETE", "/api/v1/if-panels/{id}/assignments/{assignment_id}"),
    # Microscopes
    ("GET", "/api/v1/microscopes"),
    ("POST", "/api/v1/microscopes"),
    ("GET", "/api/v1/microscopes/recent"),
    ("POST", "/api/v1/microscopes/import"),
    ("GET", "/api/v1/microscopes/{id}"),
    ("PUT", "/api/v1/microscopes/{id}"),
    ("DELETE", "/api/v1/microscopes/{id}"),
    ("GET", "/api/v1/microscopes/{id}/export"),
    ("GET", "/api/v1/microscopes/{id}/fluorophore-compatibility"),
    ("PATCH", "/api/v1/microscopes/{id}/favorite"),
    ("POST", "/api/v1/microscopes/{id}/view"),
    # Plate Maps
    ("GET", "/api/v1/plate-maps"),
    ("POST", "/api/v1/plate-maps"),
    ("GET", "/api/v1/plate-maps/{id}"),
    ("PUT", "/api/v1/plate-maps/{id}"),
    ("DELETE", "/api/v1/plate-maps/{id}"),
    # Secondary Antibodies
    ("GET", "/api/v1/secondary-antibodies"),
    ("POST", "/api/v1/secondary-antibodies"),
    ("GET", "/api/v1/secondary-antibodies/{id}"),
    ("PUT", "/api/v1/secondary-antibodies/{id}"),
    ("DELETE", "/api/v1/secondary-antibodies/{id}"),
    ("POST", "/api/v1/secondary-antibodies/import-csv"),
    ("POST", "/api/v1/secondary-antibodies/import-confirm"),
    # Tags
    ("GET", "/api/v1/tags"),
    ("POST", "/api/v1/tags"),
    ("PUT", "/api/v1/tags/{id}"),
    ("DELETE", "/api/v1/tags/{id}"),
    # List Entries
    ("GET", "/api/v1/list-entries/{list_type}"),
    ("POST", "/api/v1/list-entries/{list_type}"),
    ("PUT", "/api/v1/list-entries/{list_type}/{entry_id}"),
    ("DELETE", "/api/v1/list-entries/{list_type}/{entry_id}"),
    # Conjugate Chemistries
    ("GET", "/api/v1/conjugate-chemistries"),
    ("POST", "/api/v1/conjugate-chemistries"),
    ("PUT", "/api/v1/conjugate-chemistries/{entry_id}"),
    ("DELETE", "/api/v1/conjugate-chemistries/{entry_id}"),
    # Preferences
    ("GET", "/api/v1/preferences"),
    ("PUT", "/api/v1/preferences/{key}"),
    # Dye Labels
    ("GET", "/api/v1/dye-labels"),
    ("POST", "/api/v1/dye-labels"),
    ("GET", "/api/v1/dye-labels/{id}"),
    ("PUT", "/api/v1/dye-labels/{id}"),
    ("DELETE", "/api/v1/dye-labels/{id}"),
    ("PATCH", "/api/v1/dye-labels/{id}/favorite"),
    # Experiments
    ("GET", "/api/v1/experiments"),
    ("POST", "/api/v1/experiments"),
    ("GET", "/api/v1/experiments/{id}"),
    ("PUT", "/api/v1/experiments/{id}"),
    ("DELETE", "/api/v1/experiments/{id}"),
    ("POST", "/api/v1/experiments/{id}/blocks"),
    ("PUT", "/api/v1/experiments/{id}/blocks/reorder"),
    ("PUT", "/api/v1/experiments/{id}/blocks/{block_id}"),
    ("DELETE", "/api/v1/experiments/{id}/blocks/{block_id}"),
    ("POST", "/api/v1/experiments/{id}/snapshot-panel"),
    # Export / Import
    ("GET", "/api/v1/export/antibodies"),
    ("GET", "/api/v1/export/conjugate-chemistries"),
    ("GET", "/api/v1/export/flow-panels"),
    ("GET", "/api/v1/export/if-panels"),
    ("GET", "/api/v1/export/instruments"),
    ("GET", "/api/v1/export/list-entries"),
    ("GET", "/api/v1/export/microscopes"),
    ("GET", "/api/v1/export/secondaries"),
    ("POST", "/api/v1/import/antibodies"),
    ("POST", "/api/v1/import/conjugate-chemistries"),
    ("POST", "/api/v1/import/flow-panels"),
    ("POST", "/api/v1/import/if-panels"),
    ("POST", "/api/v1/import/instruments"),
    ("POST", "/api/v1/import/list-entries"),
    ("POST", "/api/v1/import/microscopes"),
    ("POST", "/api/v1/import/secondaries"),
]


def _registered_routes():
    registered = set()
    for route in app.routes:
        if hasattr(route, "methods") and hasattr(route, "path"):
            for method in route.methods:
                if method in ("HEAD", "OPTIONS"):
                    continue
                normalized = route.path.rstrip("/") or "/"
                registered.add((method, normalized))
    return registered


def test_all_expected_routes_exist(client):
    """Every expected route should be registered in the FastAPI app."""
    registered = _registered_routes()
    missing = [r for r in EXPECTED_ROUTES if r not in registered]
    assert not missing, "Missing routes: %s" % missing


def test_no_double_prefix(client):
    """No route should contain a duplicated /api/v1/<segment>/api/v1/ pattern."""
    registered = _registered_routes()
    for method, path in registered:
        if not path.startswith("/api/"):
            continue
        # Double /api/ is always wrong
        assert path.count("/api/") == 1, (
            "Double /api/ prefix detected on %s %s" % (method, path)
        )
        # Router segment should not repeat (e.g. /api/v1/instruments/api/v1/instruments)
        parts = path.split("/api/v1/")
        assert len(parts) == 2, (
            "Path %s looks like it has a double /api/v1/ prefix" % path
        )
