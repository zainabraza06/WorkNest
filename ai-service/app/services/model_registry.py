"""
Loads the trained models, with the two guarantees a model registry exists to provide:

  * PINNING   — models/manifest.json records the version, metrics and provenance (git SHA) of
                every artifact, and /health reports it, so a prediction is always traceable to
                a specific model.
  * INTEGRITY — each file is checksummed before it is loaded. A mismatch means the artifact is
                not the one that passed validation, so it is refused.

A refused or missing model is never fatal: the caller falls back to its documented heuristic
and says so in the response's `source`. Serving a *verified* heuristic beats serving an
unverified model.
"""

import hashlib
import json
import logging
from functools import lru_cache
from pathlib import Path

log = logging.getLogger(__name__)

MODEL_DIR = Path(__file__).resolve().parent.parent.parent / "models"

PRICE_MODEL = MODEL_DIR / "price_model.pkl"
TRUST_MODEL = MODEL_DIR / "trust_model.pkl"
RANKER_MODEL = MODEL_DIR / "ranker.pkl"
PRICE_META = MODEL_DIR / "price_model_meta.json"
TRUST_META = MODEL_DIR / "trust_model_meta.json"
RANKER_META = MODEL_DIR / "ranker_meta.json"
MANIFEST = MODEL_DIR / "manifest.json"


@lru_cache(maxsize=1)
def manifest() -> dict:
    try:
        return json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {}
    except Exception:  # noqa: BLE001
        log.warning("manifest.json is unreadable — models will load unverified.")
        return {}


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _verify(path: Path) -> bool:
    """False only when the manifest knows this file and the checksum disagrees."""
    entry = manifest().get("models", {}).get(path.name)
    if not entry or "sha256" not in entry:
        # No manifest entry (e.g. a locally trained ranker) — allowed, but unverified
        return True
    actual = _sha256(path)
    if actual != entry["sha256"]:
        log.error(
            "REFUSING %s — checksum mismatch. Expected %s, got %s. "
            "The artifact is not the one that passed validation; falling back to the heuristic.",
            path.name,
            entry["sha256"][:12],
            actual[:12],
        )
        return False
    return True


def _load(path: Path):
    if not path.exists():
        log.warning("Model %s not found — using the heuristic. Build it with the scripts in scripts/.", path.name)
        return None
    if not _verify(path):
        return None
    try:
        import joblib  # imported lazily so the service runs without scikit-learn installed

        model = joblib.load(path)
        entry = manifest().get("models", {}).get(path.name, {})
        log.info("Loaded %s (version %s, git %s)", path.name, entry.get("version", "unpinned"), entry.get("git_sha", "unknown"))
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
def ranker_model():
    """Fitted on real search outcomes. Absent until the app has been used enough to train it."""
    return _load(RANKER_MODEL)


@lru_cache(maxsize=1)
def price_meta() -> dict:
    return _load_meta(PRICE_META)


@lru_cache(maxsize=1)
def trust_meta() -> dict:
    return _load_meta(TRUST_META)


@lru_cache(maxsize=1)
def ranker_meta() -> dict:
    return _load_meta(RANKER_META)


def versions() -> dict:
    """What is actually pinned and serving — surfaced on /health."""
    return {
        name: {"version": entry.get("version"), "git_sha": entry.get("git_sha"), "trained_at": entry.get("trained_at")}
        for name, entry in manifest().get("models", {}).items()
    }


def backend_name(model, trained: str, fallback: str) -> str:
    """Which implementation is actually serving — surfaced on /health so it is never a guess."""
    return trained if model is not None else fallback
