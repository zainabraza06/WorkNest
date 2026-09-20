"""
Behavioural tests for the trained models.

These assert properties that must hold whichever path serves the request (trained model or
heuristic fallback) — ordering, bounds, vocabulary coverage — rather than exact arithmetic,
so retraining does not produce spurious failures.
"""

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.services import pricing, trust
from app.taxonomy import CATEGORIES, CITIES, DURATION_TYPES, URGENCY_LEVELS

client = TestClient(app)

STRONG = {
    "completed_jobs": 40,
    "total_jobs": 42,
    "cancelled_jobs": 2,
    "avg_rating": 4.9,
    "review_count": 35,
    "repeat_hires": 12,
    "disputes": 0,
    "avg_response_minutes": 15,
    "account_age_days": 500,
    "id_verified": True,
    "portfolio_count": 6,
}
WEAK = {
    "completed_jobs": 3,
    "total_jobs": 10,
    "cancelled_jobs": 7,
    "avg_rating": 2.4,
    "review_count": 6,
    "disputes": 3,
    "avg_response_minutes": 900,
    "account_age_days": 20,
    "id_verified": False,
}


def score(features):
    res = client.post("/trust/score", json=features)
    assert res.status_code == 200, res.text
    return res.json()


def suggest(**kwargs):
    res = client.post("/price/suggest", json=kwargs)
    assert res.status_code == 200, res.text
    return res.json()


# ── Trust ─────────────────────────────────────────────────────────────
def test_strong_history_outscores_weak():
    strong, weak = score(STRONG), score(WEAK)
    assert strong["score"] > weak["score"]
    assert strong["score"] >= 85
    assert strong["label"] == "Highly Trusted"
    assert weak["score"] < 50


def test_new_worker_sits_near_neutral_and_is_labelled_new():
    # The most common live case: no jobs, no reviews, and no response history at all
    fresh = score({})
    assert 45 <= fresh["score"] <= 60, f"a brand-new worker should not be punished: {fresh}"
    assert fresh["label"] == "New"
    assert fresh["breakdown"], "breakdown should never be empty"


def test_missing_response_time_is_accepted():
    # avg_response_minutes is null for anyone who has never replied — must not 422
    res = client.post("/trust/score", json={**STRONG, "avg_response_minutes": None})
    assert res.status_code == 200
    assert 0 <= res.json()["score"] <= 100


def test_disputes_reduce_the_score():
    assert score({**STRONG, "disputes": 6})["score"] < score({**STRONG, "disputes": 0})["score"]


def test_verification_helps():
    assert score({**STRONG, "id_verified": True})["score"] >= score({**STRONG, "id_verified": False})["score"]


def test_score_is_always_bounded():
    absurd = {**STRONG, "completed_jobs": 10_000, "total_jobs": 10_000, "review_count": 9_000, "repeat_hires": 9_000}
    assert 0 <= score(absurd)["score"] <= 100


def test_batch_scoring():
    res = client.post("/trust/score/batch", json=[STRONG, WEAK])
    assert res.status_code == 200
    assert len(res.json()) == 2


def test_heuristic_fallback_matches_the_contract(monkeypatch):
    """With no model file (fresh clone / CI), the endpoint must still answer sensibly."""
    monkeypatch.setattr(trust, "_model_score", lambda _f: None)

    strong, weak = score(STRONG), score(WEAK)
    assert strong["source"] == trust.FALLBACK_NAME
    assert strong["score"] > weak["score"]
    assert set(strong["breakdown"]) >= {"completion", "rating", "verification", "disputes"}


# ── Pricing ───────────────────────────────────────────────────────────
def test_price_range_is_ordered_and_in_pkr():
    p = suggest(category="plumbing", city="Lahore")
    assert p["min"] < p["median"] < p["max"]
    assert p["currency"] == "PKR"
    assert 1_000 <= p["median"] <= 6_000
    assert "plumbing" in p["explanation"]


def test_every_category_and_city_is_supported():
    """The whole point of training on WorkNest's own vocabulary: nothing 422s, nothing is unpriced."""
    for category in CATEGORIES:
        for city in CITIES:
            p = suggest(category=category, city=city)
            assert p["median"] > 0, f"{category}/{city} returned no price"
            assert p["min"] < p["median"] < p["max"]


def test_every_duration_and_urgency_is_supported():
    for duration in DURATION_TYPES:
        for urgency in URGENCY_LEVELS:
            p = suggest(category="cleaning", city="Karachi", duration_type=duration, urgency=urgency)
            assert p["median"] > 0


def test_longer_durations_cost_more_but_less_per_day():
    daily = suggest(category="house_help", city="Karachi")["median"]
    monthly = suggest(category="house_help", city="Karachi", duration_type="monthly")["median"]
    assert monthly > daily * 10  # a month is worth far more than a day
    assert monthly < daily * 26  # but carries a bulk discount


def test_urgency_is_priced_in():
    flexible = suggest(category="ac_repair", city="Lahore", urgency="flexible")["median"]
    normal = suggest(category="ac_repair", city="Lahore", urgency="normal")["median"]
    urgent = suggest(category="ac_repair", city="Lahore", urgency="urgent")["median"]
    assert flexible <= normal < urgent


def test_duration_count_scales_roughly_linearly():
    one = suggest(category="ac_repair", city="Lahore")["median"]
    three = suggest(category="ac_repair", city="Lahore", duration_count=3)["median"]
    # Not exactly 3x: the median is rounded to a human-readable step at each magnitude
    assert three == pytest.approx(one * 3, rel=0.05)


def test_expensive_cities_cost_more():
    assert suggest(category="cleaning", city="Islamabad")["median"] > suggest(category="cleaning", city="Multan")["median"]


def test_unknown_category_still_returns_a_price_via_the_fallback():
    p = suggest(category="rocket_science", city="Lahore")
    assert p["median"] > 0
    assert p["source"] == pricing.FALLBACK_NAME  # outside the model's vocabulary → heuristic
    assert p["confidence"] < suggest(category="welding", city="Lahore")["confidence"]


def test_heuristic_fallback_prices_the_whole_catalogue(monkeypatch):
    monkeypatch.setattr(pricing, "_model_per_unit", lambda _req: None)
    for category in CATEGORIES:
        p = suggest(category=category, city="Lahore")
        assert p["source"] == pricing.FALLBACK_NAME
        assert p["median"] > 0


def test_invalid_duration_type_is_rejected():
    assert client.post("/price/suggest", json={"category": "plumbing", "duration_type": "yearly"}).status_code == 422
