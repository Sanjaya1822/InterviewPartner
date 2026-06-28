"""
Tests for interview session endpoints.
"""
import pytest
from unittest.mock import AsyncMock, patch


@pytest.mark.asyncio
async def test_list_sessions_empty(client, auth_headers):
    resp = await client.get("/api/v1/interviews/", headers=auth_headers)
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_list_sessions_unauthenticated(client):
    resp = await client.get("/api/v1/interviews/")
    assert resp.status_code == 401


@pytest.mark.asyncio
async def test_start_interview_missing_field(client, auth_headers):
    """Should fail if required fields are missing."""
    resp = await client.post("/api/v1/interviews/start", json={
        "experience_level": "fresher",
        "difficulty": "easy",
        "interview_type": "hr",
    }, headers=auth_headers)
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_get_nonexistent_session(client, auth_headers):
    resp = await client.get(
        "/api/v1/interviews/00000000-0000-0000-0000-000000000000",
        headers=auth_headers,
    )
    assert resp.status_code == 404
