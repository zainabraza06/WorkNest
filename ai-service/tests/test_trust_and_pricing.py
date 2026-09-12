from fastapi.testclient import TestClient

from app.main import app

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
    assert res.status_code == 200
    return res.json()


def test_strong_history_outscores_weak():
    strong, weak = score(STRONG), score(WEAK)
    assert strong["score"] > weak["score"]
    assert strong["score"] >= 85
    assert strong["label"] == "Highly Trusted"
    assert weak["score"] < 50


def test_new_worker_sits_near_neutral():
    fresh = score({})
    assert 45 <= fresh["score"] <= 55
    assert fresh["label"] == "New"
    assert set(fresh["breakdown"]) >= {"completion", "rating", "verification", "disputes"}


def test_disputes_reduce_the_score():
    clean = score({**STRONG, "disputes": 0})
    disputed = score({**STRONG, "disputes": 6})
    assert disputed["score"] < clean["score"]


def test_batch_scoring():
    res = client.post("/trust/score/batch", json=[STRONG, WEAK])
    assert res.status_code == 200
    assert len(res.json()) == 2


def suggest(**kwargs):
    res = client.post("/price/suggest", json=kwargs)
    assert res.status_code == 200
    return res.json()


def test_price_range_is_ordered_and_in_pkr():
    p = suggest(category="plumbing", city="Lahore")
    assert p["min"] < p["median"] < p["max"]
    assert p["currency"] == "PKR"
    assert 1500 <= p["median"] <= 5000
    assert "plumbing" in p["explanation"]


def test_expensive_cities_cost_more():
    assert suggest(category="cleaning", city="Islamabad")["median"] > suggest(category="cleaning", city="Multan")["median"]


def test_monthly_work_is_discounted_per_day():
    daily = suggest(category="house_help", city="Karachi")["median"]
    monthly = suggest(category="house_help", city="Karachi", duration_type="monthly")["median"]
    assert monthly > daily * 10  # a month is worth much more than a day
    assert monthly < daily * 26  # but with a bulk discount


def test_urgency_and_duration_count_scale_the_estimate():
    normal = suggest(category="ac_repair", city="Lahore")["median"]
    urgent = suggest(category="ac_repair", city="Lahore", urgency="urgent")["median"]
    assert urgent > normal

    three_days = suggest(category="ac_repair", city="Lahore", duration_count=3)["median"]
    assert three_days == normal * 3


def test_unknown_category_falls_back_with_lower_confidence():
    known = suggest(category="welding", city="Lahore")
    unknown = suggest(category="rocket_science", city="Lahore")
    assert unknown["median"] > 0
    assert unknown["confidence"] < known["confidence"]


def test_invalid_duration_type_is_rejected():
    assert client.post("/price/suggest", json={"category": "plumbing", "duration_type": "yearly"}).status_code == 422
