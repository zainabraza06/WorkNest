"""
Trains the fair-price regressor.

Two decisions worth knowing about, both measured rather than assumed (see the ceiling report
this prints):

1. The target is log(price). Prices are generated multiplicatively (anchor x duration x urgency
   x experience x noise), so errors are proportional, not absolute. Training in log space cut
   within-duration MAE from ~9.7% to ~7.5% of mean price.
2. The +/- band around the estimate is calibrated from the model's own residuals rather than a
   hard-coded percentage, so the range shown to users reflects real uncertainty.

The model predicts the price of ONE unit of the duration type; the service multiplies by
duration_count.

Run from ai-service/:  python scripts/train_price_model.py
Output: models/price_model.pkl (+ price_model_meta.json)
"""

import json

import joblib
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import HistGradientBoostingRegressor
from sklearn.metrics import mean_absolute_error, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder

import _bootstrap  # noqa: F401
from _bootstrap import DATA_DIR, MODEL_DIR
from app.taxonomy import DURATION_UNITS, PRICE_CATEGORICAL, PRICE_NUMERIC, URGENCY_MULTIPLIER

DATA_PATH = DATA_DIR / "synthetic_prices.csv"
ANCHORS_PATH = DATA_DIR / "rate_anchors.json"
MODEL_PATH = MODEL_DIR / "price_model.pkl"
META_PATH = MODEL_DIR / "price_model_meta.json"

BAND_QUANTILE = 0.10  # an 80% interval


def oracle(row, anchors) -> float:
    """E[price | features]: the best any model could do, since the per-row anchor draw is latent."""
    low, high = anchors[row["category"]][row["city"]]
    days, discount = DURATION_UNITS[row["duration_type"]]
    experience_mult = 1 + min(row["experience_years"], 10) * 0.02
    return ((low + high) / 2) * days * discount * URGENCY_MULTIPLIER[row["urgency"]] * experience_mult


def bucket_report(frame: pd.DataFrame, actual: str, predicted: str) -> dict:
    return {
        duration: {
            "mae": round(float(mean_absolute_error(g[actual], g[predicted])), 1),
            "mae_pct": round(float(mean_absolute_error(g[actual], g[predicted]) / g[actual].mean() * 100), 2),
            "r2": round(float(r2_score(g[actual], g[predicted])), 4),
            "mean_price": round(float(g[actual].mean())),
        }
        for duration, g in frame.groupby("duration_type")
    }


def train() -> None:
    df = pd.read_csv(DATA_PATH)
    anchors = json.loads(ANCHORS_PATH.read_text(encoding="utf-8"))

    X = df[PRICE_CATEGORICAL + PRICE_NUMERIC]
    y = df["price"]
    X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

    model = Pipeline(
        [
            ("prep", ColumnTransformer([("cat", OneHotEncoder(handle_unknown="ignore", sparse_output=False), PRICE_CATEGORICAL)], remainder="passthrough")),
            ("gb", HistGradientBoostingRegressor(max_iter=400, learning_rate=0.06, random_state=42)),
        ]
    )
    model.fit(X_train, np.log(y_train))
    preds = np.exp(model.predict(X_test))

    mae = mean_absolute_error(y_test, preds)
    r2 = r2_score(y_test, preds)
    mean_price = float(y_test.mean())

    evaluation = X_test.assign(actual=y_test.values, predicted=preds)
    per_duration = bucket_report(evaluation, "actual", "predicted")

    # How much of the achievable accuracy did we actually capture?
    oracle_preds = X_test.apply(lambda r: oracle(r, anchors), axis=1)
    oracle_eval = X_test.assign(actual=y_test.values, predicted=oracle_preds.values)
    ceiling = bucket_report(oracle_eval, "actual", "predicted")

    # Empirical band: where do actual prices sit relative to the prediction?
    ratio = y_test.values / preds
    band_low = float(np.quantile(ratio, BAND_QUANTILE))
    band_high = float(np.quantile(ratio, 1 - BAND_QUANTILE))
    coverage = float(np.mean((ratio >= band_low) & (ratio <= band_high)))

    print(f"MAE: PKR {mae:,.0f}  ({mae / mean_price * 100:.1f}% of mean price)")
    print(f"R^2: {r2:.4f}  (headline — inflated by duration; read the buckets below)\n")
    print(f"{'bucket':<10} {'MAE%':>7} {'ceiling':>9} {'captured':>10}   R2 / ceiling R2")
    for duration, stats in per_duration.items():
        ceil = ceiling[duration]
        captured = (1 - (stats["mae_pct"] - ceil["mae_pct"]) / max(stats["mae_pct"], 1e-9)) * 100
        print(f"{duration:<10} {stats['mae_pct']:>6.2f}% {ceil['mae_pct']:>8.2f}% {captured:>9.0f}%   {stats['r2']:.4f} / {ceil['r2']:.4f}")
    print(f"\nBand: x{band_low:.3f} – x{band_high:.3f}  (covers {coverage * 100:.0f}% of actual prices)")

    joblib.dump(model, MODEL_PATH, compress=3)
    META_PATH.write_text(
        json.dumps(
            {
                "model": "HistGradientBoostingRegressor(log target)",
                "mae": mae,
                "r2": r2,
                "mean_price": mean_price,
                "per_duration": per_duration,
                "ceiling_per_duration": ceiling,
                "band": {"low": round(band_low, 4), "high": round(band_high, 4), "coverage": round(coverage, 4), "quantile": BAND_QUANTILE},
                "categorical_features": PRICE_CATEGORICAL,
                "numeric_features": PRICE_NUMERIC,
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
