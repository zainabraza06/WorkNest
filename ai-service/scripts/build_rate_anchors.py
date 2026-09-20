"""
Builds data/rate_anchors.json — the wage anchors the price training data is sampled around.

Each anchor is a [low, high] daily PKR band per category per city, derived from the base
rates and cost-of-living multipliers in app/taxonomy.py with a +/-12% band.

⚠️ These are hand-assembled plausible 2026 Pakistani rates, NOT a wage survey. They are the
documented, inspectable seed for the synthetic data — see README.

Run from ai-service/:  python scripts/build_rate_anchors.py
"""

import json

import _bootstrap  # noqa: F401  (sets sys.path)
from _bootstrap import DATA_DIR
from app.taxonomy import BASE_DAILY_PKR, CATEGORIES, CITIES, CITY_MULTIPLIER

BAND = 0.12
OUTPUT = DATA_DIR / "rate_anchors.json"


def build() -> dict:
    anchors: dict[str, dict[str, list[int]]] = {}
    for category in CATEGORIES:
        base = BASE_DAILY_PKR[category]
        per_city: dict[str, list[int]] = {}
        for city in CITIES:
            centre = base * CITY_MULTIPLIER[city]
            per_city[city] = [round(centre * (1 - BAND)), round(centre * (1 + BAND))]
        anchors[category] = per_city
    return anchors


if __name__ == "__main__":
    anchors = build()
    OUTPUT.write_text(json.dumps(anchors, indent=2), encoding="utf-8")
    print(f"Wrote {len(anchors)} categories x {len(CITIES)} cities -> {OUTPUT}")
    print("Sample:", json.dumps({"plumbing": anchors["plumbing"]["Lahore"], "house_help": anchors["house_help"]["Karachi"]}))
