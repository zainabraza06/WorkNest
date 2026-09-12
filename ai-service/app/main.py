"""
WorkNest AI service.

Stateless by design: every endpoint receives JSON and returns JSON.
This service never connects to MongoDB — the Express backend owns all data.

All three models are currently DUMMY implementations (transparent heuristics with the
same request/response contracts as the trained versions). See each module in
app/services/ for its swap-in plan.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import matching

settings = get_settings()

app = FastAPI(
    title="WorkNest AI Service",
    version="0.2.0",
    description="Semantic matching, Trust Score and fair-price prediction for WorkNest.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)

app.include_router(matching.router)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {
        "status": "ok",
        "service": "worknest-ai",
        "backends": {
            "matching": settings.matching_backend,
            "trust": settings.trust_backend,
            "pricing": settings.pricing_backend,
        },
    }
