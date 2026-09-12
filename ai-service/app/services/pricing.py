"""Fair-price prediction.

DUMMY IMPLEMENTATION — hardcoded PKR base rates with city, duration, urgency and
experience multipliers.

⚠️ SYNTHETIC DATA: these base rates are plausible 2026 Pakistani daily wages assembled by
hand for this project. They are NOT scraped from a wage survey. The real version trains a
RandomForestRegressor / XGBoost model on historical booking prices (agreed_price, category,
city, duration, urgency, worker experience) once the platform has them, falling back to
these numbers while the dataset is small.
"""

MODEL_NAME = "dummy-rulebased-v1"

# Base daily rate in PKR for one worker, per category
BASE_DAILY_PKR: dict[str, int] = {
    "plumbing": 2500,
    "electrical": 2800,
    "carpentry": 2600,
    "painting": 2200,
    "masonry": 2400,
    "cleaning": 1500,
    "house_help": 1300,
    "cooking": 1800,
    "babysitting": 1500,
    "elderly_care": 2000,
    "gardening": 1600,
    "driving": 2200,
    "ac_repair": 3000,
    "appliance_repair": 2600,
    "welding": 2800,
    "moving_labor": 1800,
    "security_guard": 1700,
    "other": 2000,
}

# Cost-of-living multipliers
CITY_MULTIPLIER: dict[str, float] = {
    "Karachi": 1.05,
    "Lahore": 1.00,
    "Islamabad": 1.15,
    "Rawalpindi": 1.00,
    "Faisalabad": 0.90,
    "Multan": 0.85,
    "Peshawar": 0.90,
    "Quetta": 0.90,
    "Hyderabad": 0.85,
    "Sialkot": 0.92,
    "Gujranwala": 0.88,
    "Other": 0.90,
}

URGENCY_MULTIPLIER = {"flexible": 0.95, "normal": 1.0, "urgent": 1.15}

# Working days covered by one unit of each duration type (and the bulk discount that comes with it)
DURATION_UNITS = {
    "one_day": (1, 1.00),
    "weekly": (6, 0.92),
    "monthly": (26, 0.78),
}

SPREAD = 0.18  # ± band around the median


def suggest_price(req) -> dict:
    base = BASE_DAILY_PKR.get(req.category, BASE_DAILY_PKR["other"])
    city_mult = CITY_MULTIPLIER.get(req.city or "Other", 0.90)
    urgency_mult = URGENCY_MULTIPLIER.get(req.urgency, 1.0)

    # Experience premium, capped at +20% so seniority never dominates the estimate
    experience_mult = 1 + min(req.experience_years, 10) * 0.02

    days_per_unit, bulk_discount = DURATION_UNITS.get(req.duration_type, DURATION_UNITS["one_day"])
    daily = base * city_mult * urgency_mult * experience_mult

    per_unit = daily * days_per_unit * bulk_discount
    median = per_unit * req.duration_count

    def rounded(value: float) -> int:
        """Round to something a human would actually say out loud."""
        step = 100 if value < 20_000 else 500
        return int(round(value / step) * step)

    city_known = (req.city or "Other") in CITY_MULTIPLIER and req.city not in (None, "Other")
    category_known = req.category in BASE_DAILY_PKR
    confidence = 0.5 + (0.2 if city_known else 0) + (0.2 if category_known else 0)

    duration_label = {"one_day": "day", "weekly": "week", "monthly": "month"}[req.duration_type]

    return {
        "min": rounded(median * (1 - SPREAD)),
        "median": rounded(median),
        "max": rounded(median * (1 + SPREAD)),
        "currency": "PKR",
        "per_unit": rounded(per_unit),
        "confidence": round(confidence, 2),
        "source": MODEL_NAME,
        "explanation": (
            f"Typical rate for {req.category.replace('_', ' ')} in {req.city or 'Pakistan'} "
            f"is about Rs {rounded(per_unit):,} per {duration_label}"
            + (f" ({req.urgency} timing)" if req.urgency != "normal" else "")
            + "."
        ),
    }
