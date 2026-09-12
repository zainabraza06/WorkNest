"""Request/response contracts shared with the Express backend.

Field names are snake_case here and mapped in backend/src/services/ai.service.js.
"""

from typing import Literal

from pydantic import BaseModel, Field

DurationType = Literal["one_day", "weekly", "monthly"]
Urgency = Literal["flexible", "normal", "urgent"]


# ── Matching ──────────────────────────────────────────────────────────
class WorkerCandidate(BaseModel):
    worker_id: str
    headline: str = ""
    bio: str = ""
    categories: list[str] = []
    skills: list[str] = []
    daily_rate: float | None = None
    avg_rating: float = 0
    review_count: int = 0
    trust_score: float = 50
    completed_jobs: int = 0
    distance_km: float | None = None
    id_verified: bool = False
    is_available: bool = True


class MatchRequest(BaseModel):
    query: str = Field("", description="Natural-language search or job description")
    category: str | None = None
    budget_max: float | None = None
    duration_type: DurationType | None = None
    candidates: list[WorkerCandidate]
    limit: int = Field(50, ge=1, le=200)


class MatchResult(BaseModel):
    worker_id: str
    score: float = Field(..., ge=0, le=1)
    semantic_score: float
    reasons: list[str] = []


class MatchResponse(BaseModel):
    results: list[MatchResult]
    model: str


# ── Trust Score ───────────────────────────────────────────────────────
class TrustFeatures(BaseModel):
    completed_jobs: int = 0
    total_jobs: int = 0
    cancelled_jobs: int = 0
    avg_rating: float = 0
    review_count: int = 0
    repeat_hires: int = 0
    disputes: int = 0
    avg_response_minutes: float | None = None
    account_age_days: int = 0
    id_verified: bool = False
    portfolio_count: int = 0


class TrustResponse(BaseModel):
    score: int = Field(..., ge=0, le=100)
    label: str
    breakdown: dict[str, float]
    source: str


# ── Fair price ────────────────────────────────────────────────────────
class PriceRequest(BaseModel):
    category: str
    city: str | None = None
    duration_type: DurationType = "one_day"
    duration_count: int = Field(1, ge=1, le=365)
    urgency: Urgency = "normal"
    experience_years: int = Field(0, ge=0, le=60)


class PriceResponse(BaseModel):
    min: int
    median: int
    max: int
    currency: str = "PKR"
    per_unit: int = Field(..., description="Fair price for a single day/week/month")
    confidence: float = Field(..., ge=0, le=1)
    source: str
    explanation: str
