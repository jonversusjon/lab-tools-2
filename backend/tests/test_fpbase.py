from __future__ import annotations

from unittest.mock import AsyncMock
from unittest.mock import patch

import pytest


MOCK_GRAPHQL_RESPONSE = {
    "data": {
        "dyes": [
            {
                "name": "Alexa Fluor 488",
                "exMax": 490,
                "emMax": 525,
                "spectra": [
                    {
                        "data": "400 0.05, 450 0.3, 490 1.0, 520 0.4",
                        "subtype": "EX",
                    },
                    {
                        "data": "500 0.1, 525 1.0, 570 0.5, 620 0.05",
                        "subtype": "EM",
                    },
                ],
            }
        ]
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
    from services.fpbase import fetch_fluorophore_from_fpbase

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=FakeResponse(MOCK_GRAPHQL_RESPONSE))

    with patch("services.fpbase.httpx.AsyncClient", return_value=mock_client):
        result = await fetch_fluorophore_from_fpbase("AF488")

    assert result["name"] == "Alexa Fluor 488"
    assert result["excitation_max_nm"] == 490
    assert result["emission_max_nm"] == 525
    assert result["source"] == "fpbase"
    assert len(result["spectra"]["excitation"]) == 4
    assert len(result["spectra"]["emission"]) == 4
    assert result["spectra"]["excitation"][2] == [490.0, 1.0]


@pytest.mark.asyncio
async def test_fetch_fluorophore_empty_raises_404():
    from fastapi import HTTPException
    from services.fpbase import fetch_fluorophore_from_fpbase

    mock_client = AsyncMock()
    mock_client.__aenter__ = AsyncMock(return_value=mock_client)
    mock_client.__aexit__ = AsyncMock(return_value=False)
    mock_client.post = AsyncMock(return_value=FakeResponse(MOCK_EMPTY_RESPONSE))

    with patch("services.fpbase.httpx.AsyncClient", return_value=mock_client):
        with pytest.raises(HTTPException) as exc_info:
            await fetch_fluorophore_from_fpbase("NonexistentDye")
        assert exc_info.value.status_code == 404


def test_fetch_fpbase_creates_new_fluorophore(client):
    mock_service = AsyncMock(return_value={
        "name": "NewFPbaseDye",
        "excitation_max_nm": 490,
        "emission_max_nm": 525,
        "spectra": {"excitation": [[490, 1.0]], "emission": [[525, 1.0]]},
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


def test_fetch_fpbase_updates_existing_fluorophore(client):
    # Create a fluorophore first
    client.post("/api/v1/fluorophores", json={
        "name": "UpdateTarget",
        "excitation_max_nm": 400,
        "emission_max_nm": 500,
        "source": "user",
    })

    mock_service = AsyncMock(return_value={
        "name": "UpdateTarget",
        "excitation_max_nm": 490,
        "emission_max_nm": 525,
        "spectra": {"excitation": [[490, 1.0]], "emission": [[525, 1.0]]},
        "source": "fpbase",
    })

    with patch("services.fpbase.fetch_fluorophore_from_fpbase", mock_service):
        resp = client.post("/api/v1/fluorophores/fetch-fpbase", json={"name": "UpdateTarget"})

    assert resp.status_code == 200
    data = resp.json()
    assert data["excitation_max_nm"] == 490
    assert data["source"] == "fpbase"

    # Should NOT create a duplicate
    list_resp = client.get("/api/v1/fluorophores?limit=500")
    count = sum(1 for f in list_resp.json()["items"] if f["name"] == "UpdateTarget")
    assert count == 1
