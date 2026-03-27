from __future__ import annotations

import time

import httpx
from fastapi import HTTPException

FPBASE_GRAPHQL_URL = "https://www.fpbase.org/graphql/"

QUERY = """
query GetDye($name: String!) {
    dye(name: $name) {
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
    dyes {
        name
        id
        slug
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
    fluorophores = data.get("data", {}).get("dyes", [])
    if not isinstance(fluorophores, list):
        raise HTTPException(
            status_code=502,
            detail="Unexpected response from FPbase",
        )

    catalog = [{"name": f["name"], "id": f["id"], "slug": f.get("slug", "")} for f in fluorophores]
    _catalog_cache = catalog
    _catalog_cache_time = now
    return catalog





async def fetch_fluorophore_from_fpbase(name: str) -> dict:
    """Fetch fluorophore data from FPbase GraphQL API."""
    # First get the catalog to find the correct slug for this name
    catalog = await fetch_fpbase_catalog()
    slug = next((item["slug"] for item in catalog if item["name"] == name), None)
    
    if not slug:
        raise HTTPException(status_code=404, detail=f"Fluorophore '{name}' not found in FPbase catalog")

    try:
        async with httpx.AsyncClient() as client:
            response = await client.post(
                FPBASE_GRAPHQL_URL,
                json={"query": QUERY, "variables": {"name": slug}},
                timeout=15.0,
            )
            response.raise_for_status()
    except (httpx.HTTPError, httpx.TimeoutException):
        raise HTTPException(
            status_code=502,
            detail="FPbase service unavailable",
        )

    data = response.json()
    dye = data.get("data", {}).get("dye")
    if not dye:
        raise HTTPException(status_code=404, detail="Fluorophore not found on FPbase")
        
    excitation = None
    emission = None
    for spec in dye.get("spectra", []):
        subtype = spec.get("subtype", "")
        # GraphQL returns data as [[wavelength, intensity], ...] already
        parsed = spec.get("data", [])
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
