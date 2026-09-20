"""
Writes models/manifest.json — the minimum a model registry actually does: pin a version,
record where it came from, and make tampering detectable.

Run after training:  python scripts/build_manifest.py

The service checksums every model against this file before loading it. A mismatch means the
artifact is not the one that passed validation, so it is refused and the documented heuristic
serves instead.
"""

import hashlib
import json
import subprocess
from datetime import date

import _bootstrap  # noqa: F401
from _bootstrap import MODEL_DIR

MANIFEST = MODEL_DIR / "manifest.json"

# model file -> (version, metrics file, metrics worth surfacing)
TRACKED = {
    "price_model.pkl": ("v2-histgb-log", "price_model_meta.json", ["mae", "r2", "n_rows"]),
    "trust_model.pkl": ("v2-histgb-monotonic", "trust_model_meta.json", ["mae", "r2", "events_provably_safe", "n_rows"]),
    "ranker.pkl": ("v1-logreg", "ranker_meta.json", ["roc_auc", "n_rows", "n_positives"]),
}


def sha256(path) -> str:
    digest = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            digest.update(chunk)
    return digest.hexdigest()


def git_sha() -> str:
    try:
        return subprocess.check_output(["git", "rev-parse", "--short", "HEAD"], text=True, stderr=subprocess.DEVNULL).strip()
    except Exception:  # noqa: BLE001 - a tarball checkout has no git metadata
        return "unknown"


def build() -> dict:
    entries = {}
    for filename, (version, meta_name, keys) in TRACKED.items():
        path = MODEL_DIR / filename
        if not path.exists():
            continue  # ranker.pkl only exists once there is real usage to train on

        meta_path = MODEL_DIR / meta_name
        meta = json.loads(meta_path.read_text(encoding="utf-8")) if meta_path.exists() else {}

        entries[filename] = {
            "version": version,
            "sha256": sha256(path),
            "size_bytes": path.stat().st_size,
            "trained_at": date.today().isoformat(),
            "git_sha": git_sha(),
            "metrics": {k: meta[k] for k in keys if k in meta},
        }
    return {"schema": 1, "models": entries}


if __name__ == "__main__":
    manifest = build()
    MANIFEST.write_text(json.dumps(manifest, indent=2), encoding="utf-8")
    print(f"Wrote {MANIFEST}")
    for name, entry in manifest["models"].items():
        print(f"  {name:<18} {entry['version']:<22} {entry['sha256'][:12]}…  {entry['size_bytes'] / 1e6:.2f} MB")
    if "ranker.pkl" not in manifest["models"]:
        print("  (no ranker yet — it is trained from real search outcomes)")
