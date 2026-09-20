"""
Feature derivation for the Trust Score model — shared by the trainer and the service so the
two can never drift apart.

Why derive at all, when the backend sends raw counters? Because monotonic constraints are
meaningless on raw counts: "completed_jobs + 1" always arrives with "total_jobs + 1", so
constraining the numerator while the denominator moves freely guarantees nothing. On rates the
direction of every feature is unambiguous, which lets the model be monotone *by construction*:
finishing work can never lower a worker's score, and a dispute can never raise it.
"""

# Model input order. The backend's payload is unchanged — this is computed from it.
TRUST_MODEL_FEATURES: list[str] = [
    "completion_rate",
    "dispute_rate",
    "repeat_hires",
    "rating_norm",
    "completed_jobs",
    "cancelled_jobs",
    "review_count",
    "response_minutes",
    "response_known",
    "account_age_days",
    "id_verified",
    "portfolio_count",
]

# +1: raising it must never lower the score.  -1: raising it must never raise the score.
TRUST_MONOTONIC: dict[str, int] = {
    "completion_rate": 1,
    "dispute_rate": -1,
    "repeat_hires": 1,
    "rating_norm": 1,
    "completed_jobs": 1,
    "cancelled_jobs": -1,
    "review_count": 1,
    "response_minutes": -1,
    "response_known": 0,  # a flag, not a quality signal
    "account_age_days": 1,
    "id_verified": 1,
    "portfolio_count": 1,
}

MONOTONIC_CST: list[int] = [TRUST_MONOTONIC[f] for f in TRUST_MODEL_FEATURES]

NEUTRAL_COMPLETION = 0.7  # prior for a worker with no jobs yet
NEUTRAL_RATING = 0.6  # prior for a worker with no reviews yet


def derive_trust_features(
    *,
    completed_jobs: int = 0,
    total_jobs: int = 0,
    cancelled_jobs: int = 0,
    avg_rating: float = 0.0,
    review_count: int = 0,
    repeat_hires: int = 0,
    disputes: int = 0,
    avg_response_minutes: float | None = None,
    account_age_days: int = 0,
    id_verified: bool = False,
    portfolio_count: int = 0,
    response_known: int | None = None,
    **_ignored,
) -> dict:
    """Maps the backend's worker counters to the model's input row.

    Unknown values get an explicit neutral prior rather than a zero, so a brand-new worker
    reads as *unrated*, not *bad*.
    """
    known = (1 if avg_response_minutes is not None else 0) if response_known is None else int(response_known)

    return {
        "completion_rate": (completed_jobs / total_jobs) if total_jobs else NEUTRAL_COMPLETION,
        "dispute_rate": (disputes / total_jobs) if total_jobs else 0.0,
        "repeat_hires": repeat_hires,
        "rating_norm": ((avg_rating - 1) / 4) if review_count else NEUTRAL_RATING,
        "completed_jobs": completed_jobs,
        "cancelled_jobs": cancelled_jobs,
        "review_count": review_count,
        "response_minutes": avg_response_minutes if avg_response_minutes is not None else 0,
        "response_known": known,
        "account_age_days": account_age_days,
        "id_verified": int(bool(id_verified)),
        "portfolio_count": portfolio_count,
    }
