"""
Generates synthetic training data for the fair-price model, in WorkNest's own vocabulary
(18 categories x 12 cities x 3 durations x 3 urgency levels).

Rows are sampled around the wage anchors in data/rate_anchors.json, then scaled by duration
(with the volume discount a month of work actually gets), urgency and experience, with noise
so the model has to learn the interactions rather than memorise a formula.

⚠️ SYNTHETIC: no real booking data exists pre-launch. Documented, not hidden — see README.

Run from ai-service/:  python scripts/generate_price_data.py
"""

import json
import random

import pandas as pd

import _bootstrap  # noqa: F401
from _bootstrap import DATA_DIR
from app.taxonomy import DURATION_UNITS, URGENCY_MULTIPLIER

random.seed(42)

ANCHORS = DATA_DIR / "rate_anchors.json"
OUTPUT = DATA_DIR / "synthetic_prices.csv"
ROWS_PER_PAIR = 22  # 18 cats x 12 cities x 22 ≈ 4.7k rows, each a random duration/urgency draw


def generate() -> pd.DataFrame:
    anchors = json.loads(ANCHORS.read_text(encoding="utf-8"))
    rows = []

    for category, cities in anchors.items():
        for city, (low, high) in cities.items():
            for _ in range(ROWS_PER_PAIR):
                base_daily = random.uniform(low, high)
                duration_type = random.choice(list(DURATION_UNITS))
                urgency = random.choice(list(URGENCY_MULTIPLIER))
                experience_years = random.randint(0, 25)

                days, bulk_discount = DURATION_UNITS[duration_type]
                # Experience premium tops out at +20% so seniority never dominates the estimate
                experience_mult = 1 + min(experience_years, 10) * 0.02

                price = (
                    base_daily
                    * days
                    * bulk_discount
                    * URGENCY_MULTIPLIER[urgency]
                    * experience_mult
                    * random.uniform(0.92, 1.08)  # noise
                )

                rows.append(
                    {
                        "category": category,
                        "city": city,
                        "duration_type": duration_type,
                        "urgency": urgency,
                        "experience_years": experience_years,
                        "price": round(price),
                    }
                )

    return pd.DataFrame(rows)


if __name__ == "__main__":
    df = generate()
    df.to_csv(OUTPUT, index=False)
    print(f"Generated {len(df):,} rows -> {OUTPUT}")
    print(f"Categories: {df['category'].nunique()}  Cities: {df['city'].nunique()}")
    print("\nMean price per duration:")
    print(df.groupby("duration_type")["price"].mean().round(0).to_string())
