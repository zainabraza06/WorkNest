"""
WorkNest AI service.

Stateless by design: every endpoint receives JSON and returns JSON.
This service never connects to MongoDB — the Express backend owns all data.

Pricing and Trust are served by trained scikit-learn models (see scripts/); matching is a
transparent heuristic. Every model falls back to a documented heuristic when its artifact is
missing, so the contract holds either way — /health reports which path is live.
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import get_settings
from app.routers import matching, pricing, trust
from app.services import embeddings
from app.services import matching as matching_service
from app.services import pricing as pricing_service
from app.services import trust as trust_service
from app.services.model_registry import backend_name, price_meta, price_model, trust_meta, trust_model

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
app.include_router(trust.router)
app.include_router(pricing.router)


@app.get("/health", tags=["meta"])
def health() -> dict:
    return {
        "status": "ok",
        "service": "worknest-ai",
        "backends": {
            # Reported from the loaded artifacts, so "is the model actually serving?" is never a guess
            "matching": matching_service.MODEL_NAME if embeddings.is_available() else matching_service.LEXICAL_NAME,
            "trust": backend_name(trust_model(), trust_service.MODEL_NAME, trust_service.FALLBACK_NAME),
            "pricing": backend_name(price_model(), pricing_service.MODEL_NAME, pricing_service.FALLBACK_NAME),
        },
        "metrics": {
            "pricing": {k: price_meta().get(k) for k in ("mae", "r2", "n_rows") if price_meta()},
            "trust": {k: trust_meta().get(k) for k in ("mae", "r2", "n_rows") if trust_meta()},
        },
    }
