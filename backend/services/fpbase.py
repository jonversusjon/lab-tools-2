from __future__ import annotations

import time

import httpx
from fastapi import HTTPException

FPBASE_GRAPHQL_URL = "https://www.fpbase.org/graphql/"

QUERY = """
query GetDye($name: String!) {
    dyes(name: $name) {
        name
        exMax
        emMax
        spectra {
            data
            subtype
        }
    }
}
"""

CATALOG_QUERY = """
query {
    fluorophores {
        name
        id
    }
}
"""

# Module-level cache for catalog
_catalog_cache: list[dict] | None = None
_catalog_cache_time: float = 0.0
CATALOG_TTL_SECONDS = 3600  # 1 hour


async def fetch_fpbase_catalog() -> list[dict]:
    """Fetch the full fluorophore catalog from FPbase. Cached for 1 hour."""
    global _catalog_cache, _catalog_cache_time

    now = time.time()
    if _catalog_cache is not None and (now - _catalog_cache_time) < CATALOG_TTL_SECONDS:
        return _catalog_cache

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                FPBASE_GRAPHQL_URL,
                json={"query": CATALOG_QUERY},
                timeout=30.0,
            )
            response.raise_for_status()
    except (httpx.HTTPError, httpx.TimeoutException):
        raise HTTPException(
            status_code=502,
            detail="FPbase service unavailable",
        )

    data = response.json()
    fluorophores = data.get("data", {}).get("fluorophores", [])
    if not isinstance(fluorophores, list):
        raise HTTPException(
            status_code=502,
            detail="Unexpected response from FPbase",
        )

    catalog = [{"name": f["name"], "id": f["id"]} for f in fluorophores]
    _catalog_cache = catalog
    _catalog_cache_time = now
    return catalog


def _parse_spectra_data(data_str: str) -> list[list[float]]:
    """Parse FPbase spectra data string into [[wavelength, intensity], ...]."""
    pairs = []
    for item in data_str.split(","):
        parts = item.strip().split()
        if len(parts) == 2:
            pairs.append([float(parts[0]), float(parts[1])])
    return pairs


async def fetch_fluorophore_from_fpbase(name: str) -> dict:
    """Fetch fluorophore data from FPbase GraphQL API."""
    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                FPBASE_GRAPHQL_URL,
                json={"query": QUERY, "variables": {"name": name}},
                timeout=15.0,
            )
            response.raise_for_status()
    except (httpx.HTTPError, httpx.TimeoutException):
        raise HTTPException(
            status_code=502,
            detail="FPbase service unavailable",
        )

    data = response.json()
    dyes = data.get("data", {}).get("dyes", [])
    if not dyes:
        raise HTTPException(status_code=404, detail="Fluorophore not found on FPbase")

    dye = dyes[0]

    excitation = None
    emission = None
    for spec in dye.get("spectra", []):
        subtype = spec.get("subtype", "")
        parsed = _parse_spectra_data(spec.get("data", ""))
        if subtype == "EX" and excitation is None:
            excitation = parsed
        elif subtype == "AB" and excitation is None:
            excitation = parsed
        elif subtype == "EM" and emission is None:
            emission = parsed

    return {
        "name": dye["name"],
        "excitation_max_nm": dye.get("exMax") or 0,
        "emission_max_nm": dye.get("emMax") or 0,
        "spectra": {
            "excitation": excitation or [],
            "emission": emission or [],
        },
        "source": "fpbase",
    }
