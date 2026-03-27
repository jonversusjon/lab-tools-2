from __future__ import annotations

import time
from unittest.mock import AsyncMock
from unittest.mock import patch

import pytest


# Response for individual dye query (data.dye, singular)
MOCK_DYE_RESPONSE = {
    "data": {
        "dye": {
            "name": "Alexa Fluor 488",
            "exMax": 490,
            "emMax": 525,
            "spectra": [
                {
                    "data": [[400, 0.05], [450, 0.3], [490, 1.0], [520, 0.4]],
                    "subtype": "EX",
                },
                {
                    "data": [[500, 0.1], [525, 1.0], [570, 0.5], [620, 0.05]],
                    "subtype": "EM",
                },
            ],
        }
    }
}

MOCK_EMPTY_RESPONSE = {"data": {"dyes": []}}


class FakeResponse:
    def __init__(self, json_data, status_code=200):
        self._json = json_data
        self.status_code = status_code

    def json(self):
        return self._json

    def raise_for_status(self):
        if self.status_code >= 400:
            raise Exception("HTTP error")


@pytest.mark.asyncio
async def test_fetch_fluorophore_parses_response():
    import services.fpbase as fpbase_mod
    from services.fpbase import fetch_fluorophore_from_fpbase

    # Pre-populate catalog cache so no HTTP call is made for the catalog
    fpbase_mod._catalog_cache = [
        {"name": "Alexa Fluor 488", "id": "af488", "slug": "alexa-fluor-488"}
    ]
    fpbase_mod._catalog_cache_time = time.time()

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=FakeResponse(MOCK_DYE_RESPONSE))

    try:
        with patch("services.fpbase.httpx.AsyncClient", return_value=mock_client):
            result = await fetch_fluorophore_from_fpbase("Alexa Fluor 488")
    finally:
        fpbase_mod._catalog_cache = None
        fpbase_mod._catalog_cache_time = 0.0

    assert result["name"] == "Alexa Fluor 488"
    assert result["ex_max_nm"] == 490
    assert result["em_max_nm"] == 525
    assert result["source"] == "fpbase"
    assert result["slug"] == "alexa-fluor-488"
    assert len(result["spectra"]["EX"]) == 4
    assert len(result["spectra"]["EM"]) == 4
    assert result["spectra"]["EX"][2] == [490, 1.0]


@pytest.mark.asyncio
async def test_fetch_fluorophore_empty_raises_404():
    from fastapi import HTTPException
    import services.fpbase as fpbase_mod
    from services.fpbase import fetch_fluorophore_from_fpbase

    # Clear cache so the HTTP mock is used for catalog lookup
    fpbase_mod._catalog_cache = None
    fpbase_mod._catalog_cache_time = 0.0

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=FakeResponse(MOCK_EMPTY_RESPONSE))

    with patch("services.fpbase.httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(HTTPException) as exc_info:
            await fetch_fluorophore_from_fpbase("NonexistentDye")
        assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_catalog_returns_list():
    from services.fpbase import fetch_fpbase_catalog

    mock_catalog_response = {
        "data": {
            "dyes": [
                {"name": "EGFP", "id": "abc123"},
                {"name": "mCherry", "id": "def456"},
            ]
        }
    }
    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=FakeResponse(mock_catalog_response))

    # Clear cache before test
    import services.fpbase as fpbase_mod
    fpbase_mod._catalog_cache = None
    fpbase_mod._catalog_cache_time = 0.0

    with patch("services.fpbase.httpx.AsyncClient", return_value=mock_client):
        result = await fetch_fpbase_catalog()

    assert len(result) == 2
    assert result[0]["name"] == "EGFP"
    assert result[1]["id"] == "def456"


@pytest.mark.asyncio
async def test_catalog_uses_cache():
    import services.fpbase as fpbase_mod
    from services.fpbase import fetch_fpbase_catalog

    # Pre-populate cache
    cached = [{"name": "CachedDye", "id": "cached1"}]
    fpbase_mod._catalog_cache = cached
    fpbase_mod._catalog_cache_time = time.time()

    # Should NOT call httpx
    result = await fetch_fpbase_catalog()
    assert result == cached

    # Clean up
    fpbase_mod._catalog_cache = None
    fpbase_mod._catalog_cache_time = 0.0


def test_catalog_endpoint(client):
    mock_catalog = AsyncMock(return_value=[
        {"name": "EGFP", "id": "abc123"},
        {"name": "mCherry", "id": "def456"},
    ])

    with patch("services.fpbase.fetch_fpbase_catalog", mock_catalog):
        resp = client.get("/api/v1/fluorophores/fpbase-catalog")

    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 2
    assert data[0]["name"] == "EGFP"


def test_fetch_fpbase_creates_new_fluorophore(client):
    mock_service = AsyncMock(return_value={
        "slug": "new-fpbase-dye",
        "name": "NewFPbaseDye",
        "ex_max_nm": 490,
        "em_max_nm": 525,
        "spectra": {"EX": [[490, 1.0]], "EM": [[525, 1.0]]},
        "source": "fpbase",
    })

    with patch("services.fpbase.fetch_fluorophore_from_fpbase", mock_service):
        resp = client.post("/api/v1/fluorophores/fetch-fpbase", json={"name": "NewFPbaseDye"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["name"] == "NewFPbaseDye"
    assert data["source"] == "fpbase"

    # Verify it appears in the list
    list_resp = client.get("/api/v1/fluorophores?limit=500")
    names = [f["name"] for f in list_resp.json()["items"]]
    assert "NewFPbaseDye" in names


def test_batch_fetch_fpbase_success(client):
    call_count = 0

    async def mock_fetch(name):
        nonlocal call_count
        call_count += 1
        return {
            "slug": name.lower().replace(" ", "-"),
            "name": name,
            "ex_max_nm": 490,
            "em_max_nm": 525,
            "spectra": {"EX": [[490, 1.0]], "EM": [[525, 1.0]]},
            "source": "fpbase",
        }

    with patch("services.fpbase.fetch_fluorophore_from_fpbase", side_effect=mock_fetch):
        resp = client.post(
            "/api/v1/fluorophores/batch-fetch-fpbase",
            json={"names": ["DyeA", "DyeB"]},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["fetched"]) == 2
    assert len(data["errors"]) == 0
    assert data["fetched"][0]["name"] == "DyeA"


def test_batch_fetch_fpbase_exceeds_limit(client):
    resp = client.post(
        "/api/v1/fluorophores/batch-fetch-fpbase",
        json={"names": ["dye%d" % i for i in range(11)]},
    )
    assert resp.status_code == 400
    assert "Maximum 10" in resp.json()["detail"]


def test_batch_fetch_fpbase_partial_failure(client):
    from fastapi import HTTPException

    async def mock_fetch(name):
        if name == "BadDye":
            raise HTTPException(status_code=404, detail="Fluorophore not found on FPbase")
        return {
            "slug": name.lower().replace(" ", "-"),
            "name": name,
            "ex_max_nm": 490,
            "em_max_nm": 525,
            "spectra": {"EX": [[490, 1.0]], "EM": [[525, 1.0]]},
            "source": "fpbase",
        }

    with patch("services.fpbase.fetch_fluorophore_from_fpbase", side_effect=mock_fetch):
        resp = client.post(
            "/api/v1/fluorophores/batch-fetch-fpbase",
            json={"names": ["GoodDye", "BadDye"]},
        )

    assert resp.status_code == 200
    data = resp.json()
    assert len(data["fetched"]) == 1
    assert data["fetched"][0]["name"] == "GoodDye"
    assert len(data["errors"]) == 1
    assert data["errors"][0]["name"] == "BadDye"


def test_fetch_fpbase_updates_existing_fluorophore(client):
    # Create a fluorophore first
    client.post("/api/v1/fluorophores", json={
        "name": "UpdateTarget",
        "ex_max_nm": 400,
        "em_max_nm": 500,
        "source": "user",
    })

    mock_service = AsyncMock(return_value={
        "slug": "update-target",
        "name": "UpdateTarget",
        "ex_max_nm": 490,
        "em_max_nm": 525,
        "spectra": {"EX": [[490, 1.0]], "EM": [[525, 1.0]]},
        "source": "fpbase",
    })

    with patch("services.fpbase.fetch_fluorophore_from_fpbase", mock_service):
        resp = client.post("/api/v1/fluorophores/fetch-fpbase", json={"name": "UpdateTarget"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["ex_max_nm"] == 490
    assert data["source"] == "fpbase"

    # Should NOT create a duplicate
    list_resp = client.get("/api/v1/fluorophores?limit=500")
    count = sum(1 for f in list_resp.json()["items"] if f["name"] == "UpdateTarget")
    assert count == 1
