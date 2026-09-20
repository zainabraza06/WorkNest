"""
Single source of truth for the vocabulary the models are trained on.

This MUST stay in step with backend/src/constants/index.js. If a category or city
is added there, add it here and retrain — otherwise the model silently falls back
to its nearest-neighbour encoding for an input it has never seen.

Base daily rates are plausible 2026 Pakistani wages assembled by hand for this
project (see README: they are NOT from a wage survey). They seed the training
data; the model learns the duration/urgency/experience interactions on top.
"""

# WorkNest's 18 job categories, in the order the backend declares them
CATEGORIES: list[str] = [
    "plumbing",
    "electrical",
    "carpentry",
    "painting",
    "masonry",
    "cleaning",
    "house_help",
    "cooking",
    "babysitting",
    "elderly_care",
    "gardening",
    "driving",
    "ac_repair",
    "appliance_repair",
    "welding",
    "moving_labor",
    "security_guard",
    "other",
]

# WorkNest's 12 cities
CITIES: list[str] = [
    "Karachi",
    "Lahore",
    "Islamabad",
    "Rawalpindi",
    "Faisalabad",
    "Multan",
    "Peshawar",
    "Quetta",
    "Hyderabad",
    "Sialkot",
    "Gujranwala",
    "Other",
]

DURATION_TYPES: list[str] = ["one_day", "weekly", "monthly"]

URGENCY_LEVELS: list[str] = ["flexible", "normal", "urgent"]

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

URGENCY_MULTIPLIER: dict[str, float] = {
    "flexible": 0.95,
    "normal": 1.00,
    "urgent": 1.15,
}

# Working days covered by one unit of each duration, with the bulk discount that comes with it
DURATION_UNITS: dict[str, tuple[int, float]] = {
    "one_day": (1, 1.00),
    "weekly": (6, 0.92),
    "monthly": (26, 0.78),
}

# Trust model feature order — exactly the payload backend/src/services/trust.service.js sends,
# plus a response_known flag because avg_response_minutes is null for workers who never replied.
TRUST_FEATURES: list[str] = [
    "completed_jobs",
    "total_jobs",
    "cancelled_jobs",
    "avg_rating",
    "review_count",
    "repeat_hires",
    "disputes",
    "avg_response_minutes",
    "response_known",
    "account_age_days",
    "id_verified",
    "portfolio_count",
]

PRICE_CATEGORICAL: list[str] = ["category", "city", "duration_type", "urgency"]
PRICE_NUMERIC: list[str] = ["experience_years"]
