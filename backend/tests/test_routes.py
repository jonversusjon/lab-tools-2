from __future__ import annotations

"""Verify all API routes resolve at their expected full paths.
Catches double-prefix bugs where router files accidentally include a prefix."""

from main import app

EXPECTED_ROUTES = [
    ("GET", "/api/v1/instruments"),
    ("POST", "/api/v1/instruments"),
    ("GET", "/api/v1/instruments/{id}"),
    ("PUT", "/api/v1/instruments/{id}"),
    ("DELETE", "/api/v1/instruments/{id}"),
    ("GET", "/api/v1/fluorophores"),
    ("POST", "/api/v1/fluorophores"),
    ("GET", "/api/v1/fluorophores/{id}/spectra"),
    ("POST", "/api/v1/fluorophores/fetch-fpbase"),
    ("POST", "/api/v1/fluorophores/batch-spectra"),
    ("GET", "/api/v1/antibodies"),
    ("POST", "/api/v1/antibodies"),
    ("GET", "/api/v1/antibodies/{id}"),
    ("PUT", "/api/v1/antibodies/{id}"),
    ("DELETE", "/api/v1/antibodies/{id}"),
    ("GET", "/api/v1/panels"),
    ("POST", "/api/v1/panels"),
    ("GET", "/api/v1/panels/{id}"),
    ("PUT", "/api/v1/panels/{id}"),
    ("DELETE", "/api/v1/panels/{id}"),
    ("POST", "/api/v1/panels/{id}/targets"),
    ("DELETE", "/api/v1/panels/{id}/targets/{target_id}"),
    ("POST", "/api/v1/panels/{id}/assignments"),
    ("DELETE", "/api/v1/panels/{id}/assignments/{assignment_id}"),
]


def test_all_expected_routes_exist(client):
    """Every expected route should be registered in the FastAPI app."""
    registered = set()
    for route in app.routes:
        if hasattr(route, "methods") and hasattr(route, "path"):
            for method in route.methods:
                normalized = route.path.rstrip("/") or "/"
                registered.add((method, normalized))
    for method, path in EXPECTED_ROUTES:
        assert (method, path) in registered, (
            "Route %s %s not found. Registered routes: %s"
            % (method, path, sorted(registered))
        )
