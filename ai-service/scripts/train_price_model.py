"""
Trains the fair-price regressor (RandomForest over one-hot encoded WorkNest categories/cities).

The model predicts the price for ONE unit of the duration type (one day / one week / one month);
the service multiplies by duration_count.

Run from ai-service/:  python scripts/train_price_model.py
Output: models/price_model.pkl (+ price_model_meta.json)
"""

import json

import joblib
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

import _bootstrap  # noqa: F401
from _bootstrap import DATA_DIR, MODEL_DIR
from app.taxonomy import PRICE_CATEGORICAL, PRICE_NUMERIC

DATA_PATH = DATA_DIR / "synthetic_prices.csv"
MODEL_PATH = MODEL_DIR / "price_model.pkl"
META_PATH = MODEL_DIR / "price_model_meta.json"


def train() -> None:
    df = pd.read_csv(DATA_PATH)
    X = df[PRICE_CATEGORICAL + PRICE_NUMERIC]
    y = df["price"]

    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = Pipeline(
        [
            ("prep", ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore"), PRICE_CATEGORICAL)], remainder="passthrough")),
            # Depth-capped and modest in size: this keeps the pickle small enough to regenerate
            # quickly and avoids memorising the generator's noise.
            ("rf", RandomForestRegressor(n_estimators=120, max_depth=14, min_samples_leaf=3, random_state=42, n_jobs=-1)),
        ]
    )
    model.fit(X_train, y_train)

    preds = model.predict(X_test)
    mae = mean_absolute_error(y_test, preds)
    r2 = r2_score(y_test, preds)
    mean_price = float(y_test.mean())

    # Within-duration scores matter more than the headline: predicting that a month costs more
    # than a day is trivial, so report how well it does inside each duration bucket too.
    per_duration = {}
    test = X_test.copy()
    test["actual"] = y_test
    test["pred"] = preds
    for duration, group in test.groupby("duration_type"):
        per_duration[duration] = {
            "mae": round(float(mean_absolute_error(group["actual"], group["pred"])), 1),
            "r2": round(float(r2_score(group["actual"], group["pred"])), 4),
            "mean_price": round(float(group["actual"].mean())),
        }

    ohe = model.named_steps["prep"].named_transformers_["cat"]
    encoded = list(ohe.get_feature_names_out(PRICE_CATEGORICAL)) + PRICE_NUMERIC
    grouped: dict[str, float] = {}
    for name, importance in zip(encoded, model.named_steps["rf"].feature_importances_):
        # One-hot names are "<column>_<value>"; match the column prefix so multi-word
        # values (duration_type_one_day) group under their column, not a truncated key
        base = next((col for col in PRICE_CATEGORICAL if name.startswith(f"{col}_")), name)
        grouped[base] = round(grouped.get(base, 0) + float(importance), 4)
    grouped = dict(sorted(grouped.items(), key=lambda kv: -kv[1]))

    print(f"MAE: PKR {mae:,.0f}  ({mae / mean_price * 100:.1f}% of mean price)")
    print(f"R^2: {r2:.4f}")
    print("\nWithin each duration bucket (the score that actually matters):")
    for duration, stats in per_duration.items():
        print(f"  {duration:<9} MAE PKR {stats['mae']:>8,.0f}  R^2 {stats['r2']:.4f}  (mean PKR {stats['mean_price']:,})")
    print("\nFeature importances:", json.dumps(grouped, indent=2))

    joblib.dump(model, MODEL_PATH, compress=3)
    META_PATH.write_text(
        json.dumps(
            {
                "mae": mae,
                "r2": r2,
                "mean_price": mean_price,
                "per_duration": per_duration,
                "feature_importances": grouped,
                "categorical_features": PRICE_CATEGORICAL,
                "numeric_features": PRICE_NUMERIC,
                "n_rows": len(df),
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\nModel  -> {MODEL_PATH} ({MODEL_PATH.stat().st_size / 1e6:.1f} MB)")
    print(f"Metrics-> {META_PATH}")


if __name__ == "__main__":
    train()
