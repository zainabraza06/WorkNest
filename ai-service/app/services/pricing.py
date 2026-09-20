"""
Fair-price prediction.

Serving path: a RandomForest trained on WorkNest's own 18 categories x 12 cities
(scripts/train_price_model.py). The model predicts the price for ONE unit of the duration
type; this module multiplies by duration_count and puts a band around it.

Fallback path: the transparent rule-based estimate below, used whenever the model file is
missing (fresh clone, CI) or an input falls outside what the model was trained on. The
response shape is identical either way — only `source` changes, so callers can tell.

⚠️ SYNTHETIC TRAINING DATA: base rates in app/taxonomy.py are plausible 2026 Pakistani wages
assembled by hand, not a wage survey. Documented in the README, not hidden.
"""

from app.services.model_registry import price_meta, price_model
from app.taxonomy import (
    BASE_DAILY_PKR,
    CATEGORIES,
    CITIES,
    CITY_MULTIPLIER,
    DURATION_UNITS,
    URGENCY_MULTIPLIER,
)

MODEL_NAME = "gb-worknest-v2"
FALLBACK_NAME = "rulebased-v1"

# Used only by the fallback; the model path reads its band from the trained metadata
SPREAD = 0.18
DURATION_LABEL = {"one_day": "day", "weekly": "week", "monthly": "month"}


def _rounded(value: float) -> int:
    """Round to something a human would actually say out loud."""
    step = 100 if value < 20_000 else 500
    return int(round(value / step) * step)


def _heuristic_per_unit(req) -> float:
    base = BASE_DAILY_PKR.get(req.category, BASE_DAILY_PKR["other"])
    city_mult = CITY_MULTIPLIER.get(req.city or "Other", 0.90)
    urgency_mult = URGENCY_MULTIPLIER.get(req.urgency, 1.0)
    experience_mult = 1 + min(req.experience_years, 10) * 0.02
    days, bulk_discount = DURATION_UNITS.get(req.duration_type, DURATION_UNITS["one_day"])
    return base * city_mult * urgency_mult * experience_mult * days * bulk_discount


def _model_per_unit(req) -> float | None:
    """Returns None if the model is unavailable or the input is outside its vocabulary."""
    model = price_model()
    if model is None:
        return None
    if req.category not in CATEGORIES or (req.city and req.city not in CITIES):
        return None

    try:
        import pandas as pd

        row = pd.DataFrame(
            [
                {
                    "category": req.category,
                    "city": req.city or "Other",
                    "duration_type": req.duration_type,
                    "urgency": req.urgency,
                    "experience_years": req.experience_years,
                }
            ]
        )
        # Trained on log(price) — errors on prices are proportional, not absolute
        import math

        return float(math.exp(model.predict(row)[0]))
    except Exception:  # noqa: BLE001 - never let a prediction failure break the endpoint
        return None


def suggest_price(req) -> dict:
    per_unit = _model_per_unit(req)
    source = MODEL_NAME

    if per_unit is None:
        per_unit = _heuristic_per_unit(req)
        source = FALLBACK_NAME

    median = per_unit * req.duration_count

    # An 80% interval measured from the model's own residuals beats a guessed percentage
    band = price_meta().get("band") or {}
    low_mult = band.get("low", 1 - SPREAD) if source == MODEL_NAME else 1 - SPREAD
    high_mult = band.get("high", 1 + SPREAD) if source == MODEL_NAME else 1 + SPREAD

    city_known = req.city in CITIES and req.city != "Other"
    category_known = req.category in BASE_DAILY_PKR
    confidence = 0.5 + (0.2 if city_known else 0) + (0.2 if category_known else 0)
    if source == MODEL_NAME:
        confidence = min(1.0, confidence + 0.1)

    unit_label = DURATION_LABEL.get(req.duration_type, "day")
    urgency_note = f" ({req.urgency} timing)" if req.urgency != "normal" else ""

    return {
        "min": _rounded(median * low_mult),
        "median": _rounded(median),
        "max": _rounded(median * high_mult),
        "currency": "PKR",
        "per_unit": _rounded(per_unit),
        "confidence": round(confidence, 2),
        "source": source,
        "explanation": (
            f"Typical rate for {req.category.replace('_', ' ')} in {req.city or 'Pakistan'} "
            f"is about Rs {_rounded(per_unit):,} per {unit_label}{urgency_note}."
        ),
    }
