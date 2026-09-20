"""
Trust Score.

Serving path: a GradientBoosting regressor trained on WorkNest's own worker counters
(scripts/train_trust_model.py) — the exact payload backend/src/services/trust.service.js
sends, so nothing is reshaped at request time.

Fallback path: the transparent weighted heuristic below, mirrored in the backend
(backend/src/services/trust.service.js) so the app keeps scoring when the AI service or the
model file is unavailable. Identical response shape; only `source` changes.

⚠️ SYNTHETIC TRAINING DATA: no behavioural data exists pre-launch, so the training target
came from a documented formula plus noise. See scripts/generate_trust_data.py and the README.
"""

from app.services.model_registry import trust_meta, trust_model
from app.taxonomy import TRUST_FEATURES

MODEL_NAME = "gb-worknest-v1"
FALLBACK_NAME = "weighted-v1"


def _clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def label_for(score: int) -> str:
    if score >= 85:
        return "Highly Trusted"
    if score >= 70:
        return "Trusted"
    if score >= 50:
        return "Building Trust"
    return "New"


def _components(f) -> dict:
    """The weighted breakdown — also what the fallback score is built from."""
    completion = f.completed_jobs / f.total_jobs if f.total_jobs else 0.7  # neutral prior
    rating = (f.avg_rating - 1) / 4 if f.review_count else 0.6
    repeat = _clamp01((f.repeat_hires / f.completed_jobs) * 2) if f.completed_jobs else 0.0
    response = 0.5 if f.avg_response_minutes is None else _clamp01(1 - (f.avg_response_minutes - 30) / (24 * 60 - 30))
    tenure = _clamp01(f.account_age_days / 365)
    dispute_rate = _clamp01((f.disputes / f.total_jobs) * 3) if f.total_jobs else 0.0
    portfolio = _clamp01(f.portfolio_count / 4)

    return {
        "completion": 0.22 * completion,
        "rating": 0.24 * rating,
        "verification": 0.14 if f.id_verified else 0.0,
        "responsiveness": 0.10 * response,
        "repeatHires": 0.10 * repeat,
        "tenure": 0.08 * tenure,
        "portfolio": 0.07 * portfolio,
        "disputes": -0.20 * dispute_rate,
    }


def _heuristic_score(f, breakdown: dict) -> int:
    raw = sum(breakdown.values()) / 0.95
    # Shrink toward a neutral 50 until there is enough history to trust the signal
    confidence = _clamp01((f.completed_jobs + f.review_count) / 10)
    verified_bonus = 0.05 * (1 - confidence) if f.id_verified else 0.0
    return round(100 * _clamp01(0.5 * (1 - confidence) + raw * confidence + verified_bonus))


def _model_score(f) -> float | None:
    model = trust_model()
    if model is None:
        return None
    try:
        import pandas as pd

        row = {
            "completed_jobs": f.completed_jobs,
            "total_jobs": f.total_jobs,
            "cancelled_jobs": f.cancelled_jobs,
            "avg_rating": f.avg_rating,
            "review_count": f.review_count,
            "repeat_hires": f.repeat_hires,
            "disputes": f.disputes,
            # The model was trained with an explicit "we have no response data" flag rather
            # than a magic number, because a brand-new worker has never replied to anything.
            "avg_response_minutes": f.avg_response_minutes if f.avg_response_minutes is not None else 0,
            "response_known": 0 if f.avg_response_minutes is None else 1,
            "account_age_days": f.account_age_days,
            "id_verified": int(f.id_verified),
            "portfolio_count": f.portfolio_count,
        }
        return float(model.predict(pd.DataFrame([row])[TRUST_FEATURES])[0])
    except Exception:  # noqa: BLE001
        return None


def score_worker(f) -> dict:
    breakdown = _components(f)
    predicted = _model_score(f)

    if predicted is None:
        score = _heuristic_score(f, breakdown)
        source = FALLBACK_NAME
        drivers = {k: round(v * 100, 1) for k, v in breakdown.items()}
    else:
        score = round(max(0.0, min(100.0, predicted)))
        source = MODEL_NAME
        # Global feature importances, not per-worker attribution — labelled as such so the
        # number is never mistaken for "this worker's score came from these parts".
        drivers = {k: round(v * 100, 1) for k, v in (trust_meta().get("feature_importances") or {}).items()}
        if not drivers:
            drivers = {k: round(v * 100, 1) for k, v in breakdown.items()}

    has_history = (f.completed_jobs + f.review_count) > 0

    return {
        "score": score,
        "label": label_for(score) if has_history else "New",
        "breakdown": drivers,
        "source": source,
    }
