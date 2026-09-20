"""
Lazy loader for the trained models.

Models are build artifacts, not source: they are gitignored and regenerated with the
scripts in scripts/. If they are missing (fresh clone, CI, no sklearn installed), every
loader returns None and the services fall back to their documented heuristics — the API
contract and the app keep working either way.
"""

import json
import logging
from functools import lru_cache
from pathlib import Path

log = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).resolve().parent.parent.parent / "models"

PRICE_MODEL = MODEL_DIR / "price_model.pkl"
TRUST_MODEL = MODEL_DIR / "trust_model.pkl"
PRICE_META = MODEL_DIR / "price_model_meta.json"
TRUST_META = MODEL_DIR / "trust_model_meta.json"


def _load(path: Path):
    if not path.exists():
        log.warning("Model %s not found — falling back to the heuristic. Run the scripts in scripts/ to build it.", path.name)
        return None
    try:
        import joblib  # imported lazily so the service runs without scikit-learn installed

        model = joblib.load(path)
        log.info("Loaded model %s", path.name)
        return model
    except Exception as exc:  # noqa: BLE001 - a broken model must never take the service down
        log.error("Failed to load %s (%s) — falling back to the heuristic.", path.name, exc)
        return None


def _load_meta(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8")) if path.exists() else {}
    except Exception:  # noqa: BLE001
        return {}


@lru_cache(maxsize=1)
def price_model():
    return _load(PRICE_MODEL)


@lru_cache(maxsize=1)
def trust_model():
    return _load(TRUST_MODEL)


@lru_cache(maxsize=1)
def price_meta() -> dict:
    return _load_meta(PRICE_META)


@lru_cache(maxsize=1)
def trust_meta() -> dict:
    return _load_meta(TRUST_META)


def backend_name(model, trained: str, fallback: str) -> str:
    """Which implementation is actually serving — surfaced on /health so it is never a guess."""
    return trained if model is not None else fallback
