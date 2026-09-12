"""Worker matching.

DUMMY IMPLEMENTATION — hardcoded lexical similarity with a synonym map, followed by a
weighted re-ranking over structured features (the "learning-to-rank" stage).

Swap-in plan for the real version:
  1. semantic_similarity() -> sentence-transformers embeddings (all-MiniLM-L6-v2) + cosine
     similarity over a FAISS / MongoDB Atlas Vector Search index.
  2. rerank() weights -> coefficients learned by logistic regression on hire outcomes.
The request/response contract does not change.
"""

import math
import re

MODEL_NAME = "dummy-lexical-v1"

# Everyday phrasing → the skills/categories that actually do the work.
SYNONYMS: dict[str, list[str]] = {
    "leak": ["plumbing", "pipe", "tap", "leakage"],
    "leaking": ["plumbing", "pipe", "tap"],
    "pipe": ["plumbing", "fitting", "sanitary"],
    "tap": ["plumbing", "faucet"],
    "geyser": ["plumbing", "water heater", "gas"],
    "drain": ["plumbing", "sewerage", "blockage"],
    "bathroom": ["plumbing", "sanitary"],
    "wiring": ["electrical", "electrician"],
    "socket": ["electrical", "switch", "wiring"],
    "switch": ["electrical", "wiring"],
    "fan": ["electrical", "ceiling fan"],
    "light": ["electrical", "bulb", "fitting"],
    "ups": ["electrical", "inverter", "battery"],
    "shortcircuit": ["electrical", "fault"],
    "ac": ["ac_repair", "air conditioner", "cooling"],
    "cooling": ["ac_repair", "air conditioner"],
    "fridge": ["appliance_repair", "refrigerator"],
    "washing": ["appliance_repair", "washing machine"],
    "paint": ["painting", "emulsion", "whitewash"],
    "wall": ["painting", "masonry", "plaster"],
    "furniture": ["carpentry", "wood", "polish"],
    "door": ["carpentry", "wood", "lock"],
    "wood": ["carpentry"],
    "cement": ["masonry", "concrete", "plaster"],
    "brick": ["masonry", "construction"],
    "tiles": ["masonry", "flooring", "tiling"],
    "clean": ["cleaning", "sweeping", "mopping"],
    "cleaning": ["cleaning", "house_help", "maid"],
    "maid": ["house_help", "cleaning", "domestic"],
    "cook": ["cooking", "chef", "khana"],
    "cooking": ["cooking", "house_help"],
    "baby": ["babysitting", "child care", "nanny"],
    "child": ["babysitting", "nanny"],
    "elderly": ["elderly_care", "attendant", "nursing"],
    "garden": ["gardening", "lawn", "plants"],
    "lawn": ["gardening", "grass"],
    "driver": ["driving", "chauffeur", "car"],
    "car": ["driving", "chauffeur"],
    "shift": ["moving_labor", "loading", "shifting"],
    "shifting": ["moving_labor", "loading", "packers"],
    "guard": ["security_guard", "chowkidar", "watchman"],
    "welding": ["welding", "grill", "iron"],
    "grill": ["welding", "iron", "gate"],
    "urgent": [],
    "today": [],
    "need": [],
    "someone": [],
}

STOPWORDS = {
    "a", "an", "and", "the", "to", "for", "of", "in", "on", "at", "my", "our", "is", "are",
    "i", "we", "need", "want", "looking", "someone", "please", "help", "with", "who", "can",
    "asap", "job", "work", "worker", "hire", "hiring", "house", "home",
}


def tokenize(text: str) -> set[str]:
    words = re.findall(r"[a-z]+", (text or "").lower())
    return {w for w in words if len(w) > 1 and w not in STOPWORDS}


def expand(tokens: set[str]) -> set[str]:
    """Adds synonym terms so 'leaking pipe' can match a profile that says 'plumbing'."""
    out = set(tokens)
    for token in tokens:
        for syn in SYNONYMS.get(token, []):
            out.update(tokenize(syn))
    return out


def semantic_similarity(query: str, candidate_text: str) -> float:
    """Stand-in for embedding cosine similarity: synonym-expanded weighted overlap."""
    q = expand(tokenize(query))
    c = expand(tokenize(candidate_text))
    if not q or not c:
        return 0.0

    overlap = q & c
    if not overlap:
        return 0.0

    # Rare terms carry more signal than common ones, roughly mimicking IDF weighting
    weight = sum(1 / math.log2(2 + len(SYNONYMS.get(t, []))) for t in overlap)
    return min(1.0, weight / math.sqrt(len(q)))


def _price_fit(daily_rate: float | None, budget_max: float | None) -> float:
    if not daily_rate or not budget_max:
        return 0.5
    if daily_rate <= budget_max:
        return 1.0
    # Gentle penalty rather than exclusion — clients often stretch for the right worker
    return max(0.0, 1 - (daily_rate - budget_max) / budget_max)


def _distance_fit(distance_km: float | None) -> float:
    if distance_km is None:
        return 0.5
    return max(0.0, 1 - distance_km / 50)


WEIGHTS = {
    "semantic": 0.45,
    "trust": 0.18,
    "rating": 0.15,
    "distance": 0.12,
    "price": 0.10,
}


def rank(request) -> list[dict]:
    """Blends semantic similarity with structured features into one 0–1 score."""
    results = []

    for c in request.candidates:
        text = " ".join([c.headline or "", c.bio or "", " ".join(c.skills), " ".join(c.categories)])
        semantic = semantic_similarity(request.query, text) if request.query else 0.5

        if request.category and request.category in c.categories:
            semantic = min(1.0, semantic + 0.25)

        rating = (c.avg_rating - 1) / 4 if c.review_count else 0.55
        trust = c.trust_score / 100
        distance = _distance_fit(c.distance_km)
        price = _price_fit(c.daily_rate, request.budget_max)

        score = (
            WEIGHTS["semantic"] * semantic
            + WEIGHTS["trust"] * trust
            + WEIGHTS["rating"] * rating
            + WEIGHTS["distance"] * distance
            + WEIGHTS["price"] * price
        )
        if not c.is_available:
            score *= 0.75
        if c.id_verified:
            score = min(1.0, score + 0.03)

        reasons = []
        if semantic >= 0.5:
            reasons.append("Skills match what you described")
        if c.trust_score >= 80:
            reasons.append("High Trust Score")
        if c.review_count and c.avg_rating >= 4.5:
            reasons.append(f"Rated {c.avg_rating:.1f} by {c.review_count} clients")
        if c.distance_km is not None and c.distance_km <= 10:
            reasons.append(f"Only {c.distance_km:.0f} km away")
        if request.budget_max and c.daily_rate and c.daily_rate <= request.budget_max:
            reasons.append("Within your budget")
        if c.id_verified:
            reasons.append("ID verified")

        results.append(
            {
                "worker_id": c.worker_id,
                "score": round(min(1.0, score), 4),
                "semantic_score": round(semantic, 4),
                "reasons": reasons[:3],
            }
        )

    results.sort(key=lambda r: r["score"], reverse=True)
    return results[: request.limit]
