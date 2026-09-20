"""
Validation gate. Exits non-zero if a model is not fit to ship.

This is the CI half of the promotion story: training writes metrics, this asserts they clear
the bar, and the build fails if they don't. Accuracy thresholds are deliberately loose — the
checks that matter are the *invariants*, because a model can be accurate and still behave
incoherently (a ranker at 0.87 AUC that penalised relevance is what prompted these).

Run from ai-service/:  python scripts/validate_models.py
"""

import json
import sys

import _bootstrap  # noqa: F401
from _bootstrap import MODEL_DIR

failures: list[str] = []
notes: list[str] = []


def check(condition: bool, label: str, detail: str = "") -> None:
    (notes if condition else failures).append(f"{label}{f' — {detail}' if detail else ''}")


def load(name: str) -> dict | None:
    path = MODEL_DIR / name
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))


# ── Price ─────────────────────────────────────────────────────────────
price = load("price_model_meta.json")
if price is None:
    failures.append("price_model_meta.json missing — run scripts/train_price_model.py")
else:
    for duration, stats in price["per_duration"].items():
        ceiling = price["ceiling_per_duration"][duration]["mae_pct"]
        check(
            stats["mae_pct"] <= ceiling * 1.35,
            f"price/{duration}: within 35% of the achievable ceiling",
            f"{stats['mae_pct']:.2f}% vs ceiling {ceiling:.2f}%",
        )
    band = price.get("band", {})
    check(0.7 <= band.get("coverage", 0) <= 0.9, "price: band covers ~80% of actual prices", f"{band.get('coverage', 0):.0%}")


# ── Trust ─────────────────────────────────────────────────────────────
trust = load("trust_model_meta.json")
if trust is None:
    failures.append("trust_model_meta.json missing — run scripts/train_trust_model.py")
else:
    check(trust["mae"] <= 4.0, "trust: MAE within 4 points", f"{trust['mae']:.2f}")
    check(trust["r2"] >= 0.85, "trust: R2 at least 0.85", f"{trust['r2']:.3f}")

    # The invariants are the point of this model
    audit = trust.get("integrity_audit", {})
    for event in ("completes_a_job", "receives_a_dispute", "gains_a_good_review", "gets_id_verified"):
        result = audit.get(event, {})
        check(result.get("safe") is True, f"trust invariant: {event}", f"{result.get('violations', '?')} violations")

    new_accounts = trust.get("new_accounts", {})
    predicted = new_accounts.get("mean_predicted", 0)
    check(45 <= predicted <= 60, "trust: a brand-new worker scores near neutral", f"{predicted}")


# ── Ranker (optional — only exists once there is real usage) ──────────
ranker = load("ranker_meta.json")
if ranker is None:
    notes.append("ranker: not trained yet (needs real search outcomes) — hand-set weights serve")
else:
    check(ranker["roc_auc"] >= 0.6, "ranker: ROC-AUC at least 0.6", f"{ranker['roc_auc']:.3f}")
    for feature, coefficient in ranker["coefficients"].items():
        if feature in ranker.get("constant_features", []):
            continue
        check(coefficient >= -0.25, f"ranker direction: {feature} not negative", f"{coefficient:+.3f}")


# ── Manifest ──────────────────────────────────────────────────────────
manifest = load("manifest.json")
if manifest is None:
    failures.append("manifest.json missing — run scripts/build_manifest.py")
else:
    for required in ("price_model.pkl", "trust_model.pkl"):
        entry = manifest["models"].get(required)
        check(bool(entry and entry.get("sha256")), f"manifest: {required} pinned with a checksum", entry.get("version", "") if entry else "absent")


print("PASS")
for note in notes:
    print("  +", note)
if failures:
    print("\nFAIL")
    for failure in failures:
        print("  x", failure)
print(f"\n{len(notes)} passed, {len(failures)} failed")
sys.exit(1 if failures else 0)
