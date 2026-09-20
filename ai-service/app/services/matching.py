"""Worker matching.

Two stages, the standard retrieve-then-rank shape:

  1. SEMANTIC — a local sentence-embedding model (app/services/embeddings.py) scores the
     client's own words against each worker's profile text. This is what lets "my geyser
     isn't heating" find a plumber with no shared keywords. Falls back to the synonym-expanded
     lexical overlap below when the model is unavailable.
  2. RE-RANK — that similarity is blended with structured features (trust, rating, distance,
     price fit) into one score, with the reasons returned alongside it.

No LLM API involved: embeddings run locally on CPU. The weights in WEIGHTS are hand-set; with
real hire outcomes they would be fitted by logistic regression, which is the only part of this
still waiting on data.
"""

import math
import re

from app.services import embeddings
from app.services.model_registry import ranker_meta, ranker_model

MODEL_NAME = "semantic-bge-small-v1"
LEXICAL_NAME = "lexical-fallback-v1"

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


def lexical_similarity(query: str, candidate_text: str) -> float:
    """Fallback scorer: synonym-expanded weighted overlap, used when embeddings are unavailable."""
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


# Hand-set priors, used until there are enough real outcomes to fit the ranker.
WEIGHTS = {
    "semantic": 0.45,
    "trust": 0.18,
    "rating": 0.15,
    "distance": 0.12,
    "price": 0.10,
}

RANKER_NAME = "ltr-logreg-v1"


def _learned_scores(rows: list[list[float]]) -> list[float] | None:
    """Probability of a click/hire from the ranker fitted on logged outcomes."""
    model = ranker_model()
    if model is None or not rows:
        return None
    try:
        import numpy as np

        return [float(p) for p in model.predict_proba(np.asarray(rows, dtype=float))[:, 1]]
    except Exception:  # noqa: BLE001 - a bad ranker must never break search
        return None


def rank(request) -> tuple[list[dict], str]:
    """Blends semantic similarity with structured features into one 0-1 score.

    Returns (results, model_name) so the caller can report which path actually ran.
    """
    candidates = request.candidates
    texts = [
        " ".join([c.headline or "", c.bio or "", " ".join(c.skills), " ".join(c.categories)]).strip()
        for c in candidates
    ]

    # Stage 1: semantic, with a lexical fallback
    semantic_scores = None
    model_used = LEXICAL_NAME
    if request.query:
        semantic_scores = embeddings.similarity(request.query, texts)
        if semantic_scores is not None:
            model_used = MODEL_NAME
        else:
            semantic_scores = [lexical_similarity(request.query, t) for t in texts]
    else:
        semantic_scores = [0.5] * len(candidates)  # nothing to match against

    # Relevance gate: quality signals should order results *within* what is relevant, never
    # promote the wrong trade. Without this a nearby, well-rated plumber outranks an
    # electrician for an electrical job by a hair of Trust Score.
    best_semantic = max(semantic_scores) if semantic_scores else 0.0
    gate_active = bool(request.query) and best_semantic > 0.15

    # Stage 2: re-rank. Feature order must match scripts/train_ranker.py FEATURES.
    feature_rows = [
        [
            semantic,
            c.trust_score / 100,
            (c.avg_rating - 1) / 4 if c.review_count else 0.55,
            _distance_fit(c.distance_km),
            _price_fit(c.daily_rate, request.budget_max),
            1.0 if c.id_verified else 0.0,
            1.0 if c.is_available else 0.0,
        ]
        for c, semantic in zip(candidates, semantic_scores)
    ]
    learned = _learned_scores(feature_rows)
    if learned is not None:
        model_used = f"{model_used}+{RANKER_NAME}"

    results = []
    for i, (c, semantic) in enumerate(zip(candidates, semantic_scores)):
        if request.category and request.category in c.categories:
            semantic = min(1.0, semantic + 0.25)

        rating = (c.avg_rating - 1) / 4 if c.review_count else 0.55
        trust = c.trust_score / 100
        distance = _distance_fit(c.distance_km)
        price = _price_fit(c.daily_rate, request.budget_max)

        if learned is not None:
            # Weights fitted on what clients actually clicked and booked
            score = learned[i]
        else:
            score = (
                WEIGHTS["semantic"] * semantic
                + WEIGHTS["trust"] * trust
                + WEIGHTS["rating"] * rating
                + WEIGHTS["distance"] * distance
                + WEIGHTS["price"] * price
            )
        if gate_active:
            # Half the top result's relevance => 75% of the score; none of it => 50%
            score *= 0.5 + 0.5 * min(1.0, semantic / best_semantic)
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
                "semantic_score": round(float(semantic), 4),
                "reasons": reasons[:3],
            }
        )

    results.sort(key=lambda r: r["score"], reverse=True)
    return results[: request.limit], model_used
