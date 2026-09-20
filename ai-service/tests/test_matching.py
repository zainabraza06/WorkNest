from fastapi.testclient import TestClient

from app.main import app

client = TestClient(app)

PLUMBER = {
    "worker_id": "w_plumber",
    "headline": "Experienced plumber for leaks and sanitary fittings",
    "skills": ["pipe fitting", "leak repair"],
    "categories": ["plumbing"],
    "daily_rate": 2500,
    "avg_rating": 4.8,
    "review_count": 30,
    "trust_score": 88,
    "distance_km": 4,
    "id_verified": True,
}
ELECTRICIAN = {
    "worker_id": "w_electrician",
    "headline": "Electrician — wiring, UPS and DB boards",
    "skills": ["wiring", "ups installation"],
    "categories": ["electrical"],
    "daily_rate": 2800,
    "avg_rating": 4.2,
    "review_count": 10,
    "trust_score": 70,
    "distance_km": 20,
}
PAINTER = {
    "worker_id": "w_painter",
    "headline": "House painter, emulsion and whitewash",
    "skills": ["emulsion"],
    "categories": ["painting"],
    "daily_rate": 2200,
    "avg_rating": 3.9,
    "review_count": 4,
    "trust_score": 55,
    "distance_km": 35,
}


def match(query, **kwargs):
    res = client.post("/match/workers", json={"query": query, "candidates": [PLUMBER, ELECTRICIAN, PAINTER], **kwargs})
    assert res.status_code == 200
    return res.json()["results"]


def test_matches_everyday_phrasing_without_keyword_overlap():
    # "leaking pipe" never says "plumbing", but should still surface the plumber
    results = match("need someone to fix a leaking pipe today")
    assert results[0]["worker_id"] == "w_plumber"
    assert results[0]["semantic_score"] > 0
    assert any("match" in r.lower() or "trust" in r.lower() for r in results[0]["reasons"])


def test_understands_intent_with_no_shared_words():
    """The reason the embedding model is here: none of these queries share a word with the
    profile they should match. Skipped when the model is unavailable (CI, offline)."""
    from app.services import embeddings

    if not embeddings.is_available():
        import pytest

        pytest.skip("embedding model unavailable — lexical fallback in use")

    assert match("the lights keep tripping when I switch on the heater")[0]["worker_id"] == "w_electrician"
    assert match("the walls look dull and need a fresh coat")[0]["worker_id"] == "w_painter"


def test_falls_back_to_lexical_without_the_model(monkeypatch):
    from app.services import embeddings

    monkeypatch.setattr(embeddings, "similarity", lambda *_a, **_k: None)
    res = client.post("/match/workers", json={"query": "fix a leaking pipe", "candidates": [PLUMBER, ELECTRICIAN, PAINTER]})
    assert res.status_code == 200
    assert res.json()["model"] == "lexical-fallback-v1"
    assert res.json()["results"][0]["worker_id"] == "w_plumber"


def test_electrical_query_prefers_electrician():
    results = match("my room switch and wiring is not working")
    assert results[0]["worker_id"] == "w_electrician"


def test_scores_are_sorted_and_bounded():
    results = match("paint two bedrooms")
    scores = [r["score"] for r in results]
    assert scores == sorted(scores, reverse=True)
    assert all(0 <= s <= 1 for s in scores)
    assert results[0]["worker_id"] == "w_painter"


def test_category_hint_boosts_matching_workers():
    plain = {r["worker_id"]: r["score"] for r in match("regular help")}
    boosted = {r["worker_id"]: r["score"] for r in match("regular help", category="painting")}
    assert boosted["w_painter"] > plain["w_painter"]


def test_limit_caps_the_result_count():
    assert len(match("fix leaking pipe", limit=2)) == 2


def test_budget_is_flagged_as_a_reason():
    results = match("paint two bedrooms", budget_max=2300)
    painter = next(r for r in results if r["worker_id"] == "w_painter")
    assert "Within your budget" in painter["reasons"]

    # A worker priced above the budget still appears, just without that reason
    plumber = next(r for r in results if r["worker_id"] == "w_plumber")
    assert "Within your budget" not in plumber["reasons"]


def test_empty_candidate_list_is_fine():
    res = client.post("/match/workers", json={"query": "anything", "candidates": []})
    assert res.status_code == 200
    assert res.json()["results"] == []
