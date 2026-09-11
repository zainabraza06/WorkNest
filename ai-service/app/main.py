"""
WorkNest AI service.

Stateless by design: every endpoint receives JSON and returns JSON.
This service never connects to MongoDB — the Express backend owns all data.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings

settings = get_settings()

app = FastAPI(
    title="WorkNest AI Service",
    version="0.1.0",
    description="Semantic matching, Trust Score and fair-price prediction for WorkNest.",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_methods=["POST", "GET"],
    allow_headers=["*"],
)


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
