"""
Generates synthetic training data for the Trust Score model.

Features are exactly the payload backend/src/services/trust.service.js sends — raw counts,
not pre-computed rates — so the service never has to reshape anything at request time.

⚠️ SYNTHETIC, and deliberately transparent: no behavioural data exists pre-launch, so the
target is computed from a hand-designed formula encoding domain assumptions (completion rate
and disputes matter most; response time and verification matter less), plus noise so the model
must learn interactions rather than memorise the formula. Documented, not hidden — see README.

Population is mixed on purpose: established workers, mid-history workers, and brand-new
accounts with zero jobs, zero reviews and no response data (avg_rating = 0, response_known = 0),
because that is the exact case the live app hits most often.

Run from ai-service/:  python scripts/generate_trust_data.py
"""

import random

import pandas as pd

import _bootstrap  # noqa: F401
from _bootstrap import DATA_DIR
from app.taxonomy import TRUST_FEATURES

random.seed(42)

OUTPUT = DATA_DIR / "synthetic_trust.csv"
N_ROWS = 6000
NEW_WORKER_SHARE = 0.18  # ~1 in 5 rows is a fresh account


def clamp01(v: float) -> float:
    return max(0.0, min(1.0, v))


def make_row() -> dict:
    is_new = random.random() < NEW_WORKER_SHARE

    if is_new:
        total_jobs = 0
        completed_jobs = 0
        cancelled_jobs = 0
        review_count = 0
        avg_rating = 0.0
        repeat_hires = 0
        disputes = 0
        response_known = 0
        avg_response_minutes = 0
        account_age_days = random.randint(0, 90)
        portfolio_count = random.randint(0, 3)
    else:
        total_jobs = random.randint(1, 60)
        completion = clamp01(random.betavariate(6, 1.5))
        completed_jobs = round(total_jobs * completion)
        cancelled_jobs = total_jobs - completed_jobs
        review_count = min(completed_jobs, round(completed_jobs * random.uniform(0.5, 1.0)))
        avg_rating = round(random.uniform(2.2, 5.0), 2) if review_count else 0.0
        repeat_hires = random.randint(0, max(0, completed_jobs // 2))
        disputes = random.choices([0, 1, 2, 3, 4], weights=[62, 20, 10, 5, 3])[0]
        response_known = 1
        avg_response_minutes = round(random.expovariate(1 / 240))  # mean ~4h, long tail
        account_age_days = random.randint(10, 1500)
        portfolio_count = random.randint(0, 10)

    # ── Target: documented formula over the derived rates ──────────────
    completion_rate = completed_jobs / total_jobs if total_jobs else 0.7  # neutral prior
    rating_norm = (avg_rating - 1) / 4 if review_count else 0.6
    repeat_rate = clamp01((repeat_hires / completed_jobs) * 2) if completed_jobs else 0.0
    responsiveness = clamp01(1 - (avg_response_minutes - 30) / (24 * 60 - 30)) if response_known else 0.5
    tenure = clamp01(account_age_days / 365)
    dispute_rate = clamp01((disputes / total_jobs) * 3) if total_jobs else 0.0
    portfolio = clamp01(portfolio_count / 4)

    id_verified = random.choices([0, 1], weights=[35, 65])[0]
    raw = (
        0.22 * completion_rate
        + 0.24 * rating_norm
        + (0.14 if id_verified else 0.0)
        + 0.10 * responsiveness
        + 0.10 * repeat_rate
        + 0.08 * tenure
        + 0.07 * portfolio
        - 0.20 * dispute_rate
    ) / 0.95

    # Shrink toward a neutral 50 until there is enough history to trust the signal
    confidence = clamp01((completed_jobs + review_count) / 10)
    verified_bonus = 0.05 * (1 - confidence) if id_verified else 0.0
    score = 100 * clamp01(0.5 * (1 - confidence) + raw * confidence + verified_bonus)
    score = max(0.0, min(100.0, score + random.gauss(0, 3)))  # noise

    return {
        "completed_jobs": completed_jobs,
        "total_jobs": total_jobs,
        "cancelled_jobs": cancelled_jobs,
        "avg_rating": avg_rating,
        "review_count": review_count,
        "repeat_hires": repeat_hires,
        "disputes": disputes,
        "avg_response_minutes": avg_response_minutes,
        "response_known": response_known,
        "account_age_days": account_age_days,
        "id_verified": id_verified,
        "portfolio_count": portfolio_count,
        "trust_score": round(score, 1),
    }


if __name__ == "__main__":
    df = pd.DataFrame([make_row() for _ in range(N_ROWS)])
    df = df[TRUST_FEATURES + ["trust_score"]]
    df.to_csv(OUTPUT, index=False)
    print(f"Generated {len(df):,} rows -> {OUTPUT}")
    print(f"New-account rows: {(df['total_jobs'] == 0).sum():,}")
    print("\nTrust score distribution:")
    print(df["trust_score"].describe().round(1).to_string())
