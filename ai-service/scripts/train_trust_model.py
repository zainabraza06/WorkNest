"""
Trains the Trust Score regressor (GradientBoosting over WorkNest's raw worker counters).

Run from ai-service/:  python scripts/train_trust_model.py
Output: models/trust_model.pkl (+ trust_model_meta.json)
"""

import json

import joblib
import pandas as pd
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split

import _bootstrap  # noqa: F401
from _bootstrap import DATA_DIR, MODEL_DIR
from app.taxonomy import TRUST_FEATURES

DATA_PATH = DATA_DIR / "synthetic_trust.csv"
MODEL_PATH = MODEL_DIR / "trust_model.pkl"
META_PATH = MODEL_DIR / "trust_model_meta.json"


def train() -> None:
    df = pd.read_csv(DATA_PATH)
    X = df[TRUST_FEATURES]
    y = df["trust_score"]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = GradientBoostingRegressor(n_estimators=300, max_depth=3, learning_rate=0.08, random_state=42)
    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    mae = mean_absolute_error(y_test, preds)
    r2 = r2_score(y_test, preds)

    # New accounts are the most common live case — report them separately
    new_mask = X_test["total_jobs"] == 0
    new_stats = {
        "n": int(new_mask.sum()),
        "mae": round(float(mean_absolute_error(y_test[new_mask], preds[new_mask])), 2) if new_mask.any() else None,
        "mean_predicted": round(float(preds[new_mask].mean()), 1) if new_mask.any() else None,
    }

    importances = {
        name: round(float(v), 4)
        for name, v in sorted(zip(TRUST_FEATURES, model.feature_importances_), key=lambda kv: -kv[1])
    }

    print(f"MAE: {mae:.2f} points on a 0-100 scale")
    print(f"R^2: {r2:.4f}")
    print(f"New accounts (total_jobs=0): n={new_stats['n']}, MAE {new_stats['mae']}, mean predicted {new_stats['mean_predicted']}")
    print("\nFeature importances:", json.dumps(importances, indent=2))

    joblib.dump(model, MODEL_PATH, compress=3)
    META_PATH.write_text(
        json.dumps(
            {
                "mae": mae,
                "r2": r2,
                "new_accounts": new_stats,
                "feature_importances": importances,
                "features": TRUST_FEATURES,
                "n_rows": len(df),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\nModel  -> {MODEL_PATH} ({MODEL_PATH.stat().st_size / 1e6:.2f} MB)")
    print(f"Metrics-> {META_PATH}")


if __name__ == "__main__":
    train()
