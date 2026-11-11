"""The AI service must only answer the backend when a service key is configured."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from app import deps
from app.main import app

client = TestClient(app)

BODY = {"category": "plumbing", "city": "Lahore", "duration_type": "one_day", "duration_count": 1}


@pytest.fixture
def configured_key(monkeypatch):
    monkeypatch.setattr(deps, "get_settings", lambda: SimpleNamespace(service_api_key="s3cret-key"))


def test_open_when_no_key_is_configured(monkeypatch):
    # Backwards compatible: local development and tests run without a key
    monkeypatch.setattr(deps, "get_settings", lambda: SimpleNamespace(service_api_key=""))
    assert client.post("/price/suggest", json=BODY).status_code == 200


def test_rejects_a_missing_key(configured_key):
    assert client.post("/price/suggest", json=BODY).status_code == 401


def test_rejects_a_wrong_key(configured_key):
    assert client.post("/price/suggest", json=BODY, headers={"X-Service-Key": "nope"}).status_code == 401


def test_rejects_a_key_that_only_shares_a_prefix(configured_key):
    assert client.post("/price/suggest", json=BODY, headers={"X-Service-Key": "s3cret-ke"}).status_code == 401


def test_accepts_the_right_key(configured_key):
    assert client.post("/price/suggest", json=BODY, headers={"X-Service-Key": "s3cret-key"}).status_code == 200


def test_health_stays_public(configured_key):
    # Platform health checks and uptime monitors carry no key
    assert client.get("/health").status_code == 200
