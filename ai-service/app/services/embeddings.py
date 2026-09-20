"""
Sentence embeddings for semantic matching.

Runs a small ONNX model locally (fastembed) — no LLM API, no API key, no per-request cost,
no network after the first download. An LLM would be the wrong tool here anyway: we need to
turn "my geyser isn't heating" into a vector near "plumber", not generate text.

Everything degrades gracefully. If the model can't load (no fastembed installed, no network on
first run, CI), `encode` returns None and matching falls back to the lexical heuristic.
"""

import hashlib
import logging
import threading

import numpy as np

log = logging.getLogger(__name__)

# 384 dimensions, ~130 MB, CPU-friendly. Cached under ~/.cache/fastembed after first download.
MODEL_NAME = "BAAI/bge-small-en-v1.5"

# Cosine calibration for this domain (see similarity() for why these values)
FLOOR = 0.40
SPAN = 0.30

_model = None
_load_failed = False
_lock = threading.Lock()

# Worker profiles barely change between requests, so their vectors are worth keeping.
_cache: dict[str, np.ndarray] = {}
_CACHE_LIMIT = 4096


def _get_model():
    global _model, _load_failed
    if _model is not None or _load_failed:
        return _model

    with _lock:
        if _model is not None or _load_failed:
            return _model
        try:
            from fastembed import TextEmbedding

            _model = TextEmbedding(model_name=MODEL_NAME)
            log.info("Loaded embedding model %s", MODEL_NAME)
        except Exception as exc:  # noqa: BLE001 - never take the service down for this
            _load_failed = True
            log.warning("Embedding model unavailable (%s) — matching falls back to lexical similarity.", exc)
    return _model


def is_available() -> bool:
    return _get_model() is not None


def _key(text: str) -> str:
    return hashlib.sha1(text.encode("utf-8")).hexdigest()


def encode(texts: list[str]) -> np.ndarray | None:
    """L2-normalised embeddings, one row per text. None if the model is unavailable."""
    model = _get_model()
    if model is None or not texts:
        return None

    keys = [_key(t) for t in texts]
    missing = [(i, t) for i, (t, k) in enumerate(zip(texts, keys)) if k not in _cache]

    if missing:
        try:
            fresh = list(model.embed([t for _, t in missing]))
        except Exception as exc:  # noqa: BLE001
            log.warning("Embedding failed (%s) — falling back to lexical similarity.", exc)
            return None

        for (i, _), vector in zip(missing, fresh):
            v = np.asarray(vector, dtype=np.float32)
            norm = np.linalg.norm(v)
            _cache[keys[i]] = v / norm if norm else v

        if len(_cache) > _CACHE_LIMIT:  # crude but sufficient: drop the oldest half
            for stale in list(_cache)[: len(_cache) // 2]:
                del _cache[stale]

    return np.vstack([_cache[k] for k in keys])


def similarity(query: str, documents: list[str]) -> list[float] | None:
    """Cosine similarity of one query against many documents, rescaled to a usable 0–1 range."""
    if not documents:
        return None

    vectors = encode([query] + documents)
    if vectors is None:
        return None

    query_vec, doc_vecs = vectors[0], vectors[1:]
    cosine = doc_vecs @ query_vec  # already normalised

    # Calibrated on this domain: unrelated trade/query pairs sit around 0.40-0.48 cosine and
    # genuine matches around 0.55-0.75. Mapping that band to 0-1 keeps the blend in rerank()
    # meaningful — an earlier, higher floor clipped real matches to zero and lost the ordering.
    scaled = np.clip((cosine - FLOOR) / SPAN, 0.0, 1.0)

    # If nothing clears the floor, keep the model's ordering rather than returning a flat zero
    # (a tie would silently fall back to whatever order the candidates arrived in).
    if float(scaled.max()) < 0.05 and len(cosine) > 1:
        spread = cosine.max() - cosine.min()
        if spread > 1e-6:
            scaled = (cosine - cosine.min()) / spread * 0.25

    return [float(s) for s in scaled]
