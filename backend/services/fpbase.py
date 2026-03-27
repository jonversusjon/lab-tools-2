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
    dyes = data.get("data", {}).get("dyes", [])
    if not isinstance(dyes, list):
        raise HTTPException(
            status_code=502,
            detail="Unexpected response from FPbase",
        )

    catalog = [
        {"name": f["name"], "id": f["id"], "slug": f.get("slug", "")}
        for f in dyes
    ]
    _catalog_cache = catalog
    _catalog_cache_time = now
    return catalog


async def fetch_fluorophore_from_fpbase(name: str) -> dict:
    """
    Fetch fluorophore data from FPbase GraphQL API.

    Returns a dict with keys: slug, name, ex_max_nm, em_max_nm, spectra, source.
    spectra is {spectrum_type: [[wavelength, intensity], ...], ...} using EX/EM/AB keys.
    """
    catalog = await fetch_fpbase_catalog()
    slug = next(
        (item["slug"] for item in catalog if item["name"] == name),
        None,
    )

    if not slug:
        raise HTTPException(
            status_code=404,
            detail="Fluorophore '%s' not found in FPbase catalog" % name,
        )

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

    spectra: dict[str, list[list[float]]] = {}
    for spec in dye.get("spectra", []):
        subtype = spec.get("subtype", "")
        points = spec.get("data", [])
        if subtype and points:
            # First entry for each subtype wins
            if subtype not in spectra:
                spectra[subtype] = points

    return {
        "slug": slug,
        "name": dye["name"],
        "ex_max_nm": dye.get("exMax"),
        "em_max_nm": dye.get("emMax"),
        "spectra": spectra,
        "source": "fpbase",
    }
