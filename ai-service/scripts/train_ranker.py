"""
Fits the learning-to-rank model on real search outcomes.

This is the one model in the project NOT trained on synthetic data — it learns from what
clients actually did. Which also means it only exists once the app has been used:

    cd backend && npm run export:ranking      # dumps ai-service/data/ranking_events.csv
    cd ai-service && python scripts/train_ranker.py

Label: did the client open this worker's profile from the search (a hire counts for more)?
Features are the ones logged at impression time, so the model learns from exactly the values
that produced the ordering the client reacted to.

Two guards decide whether the result may ship, because a bad ranker is worse than an honest
heuristic:
  * volume    — below MIN_ROWS / MIN_POSITIVES there is nothing trustworthy to fit;
  * direction — every feature here is a "goodness" signal, so a meaningfully negative weight
                means the data is confounded, however good the AUC looks.

Run from ai-service/:  python scripts/train_ranker.py
Output: models/ranker.pkl (+ ranker_meta.json)
"""

import json

import joblib
import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score
from sklearn.model_selection import train_test_split

import _bootstrap  # noqa: F401
from _bootstrap import DATA_DIR, MODEL_DIR

DATA_PATH = DATA_DIR / "ranking_events.csv"
MODEL_PATH = MODEL_DIR / "ranker.pkl"
META_PATH = MODEL_DIR / "ranker_meta.json"

MIN_ROWS = 200
MIN_POSITIVES = 50
MIN_COEFFICIENT = -0.25

# Order matters: app/services/matching.py builds its feature vector to match.
FEATURES = ["semantic", "trust", "rating", "distance", "price_fit", "verified", "available"]

HIRE_WEIGHT = 5.0  # a booking is far stronger evidence than a profile view


def build_features(df: pd.DataFrame) -> pd.DataFrame:
    rate, budget = df["daily_rate"], df["budget_max"]
    within_budget = rate.fillna(0) <= budget.fillna(0)
    overshoot = 1 - (rate.fillna(0) - budget.fillna(0)) / budget.replace(0, np.nan).fillna(1)

    return pd.DataFrame(
        {
            "semantic": df["semantic"].fillna(0),
            "trust": df["trust_score"].fillna(50) / 100,
            "rating": np.where(df["review_count"] > 0, (df["avg_rating"] - 1) / 4, 0.55),
            "distance": np.where(df["distance_km"].isna(), 0.5, np.clip(1 - df["distance_km"].fillna(0) / 50, 0, 1)),
            "price_fit": np.where(rate.isna() | budget.isna(), 0.5, np.where(within_budget, 1.0, np.clip(overshoot, 0, 1))),
            "verified": df["id_verified"].fillna(0),
            "available": df["is_available"].fillna(1),
        }
    )[FEATURES]


def train() -> None:
    if not DATA_PATH.exists():
        print(f"No {DATA_PATH.name} yet. Run `npm run export:ranking` in backend/ first.")
        return

    df = pd.read_csv(DATA_PATH)
    y = ((df["opened"] == 1) | (df["hire_intent"] == 1) | (df["hired"] == 1)).astype(int)
    positives = int(y.sum())
    print(f"{len(df)} impressions, {positives} positive ({positives / max(len(df), 1) * 100:.1f}%)")

    if len(df) < MIN_ROWS or positives < MIN_POSITIVES:
        print(
            f"\nNot enough signal to train (need {MIN_ROWS}+ rows and {MIN_POSITIVES}+ positives)."
            "\nThe service keeps the hand-set weights, which is the honest thing to do with this"
            "\nlittle data. Use the app more, re-export, and run this again."
        )
        return

    X = build_features(df)
    weights = np.where(df["hired"] == 1, HIRE_WEIGHT, np.where(df["hire_intent"] == 1, HIRE_WEIGHT / 2, 1.0))
    X_train, X_test, y_train, y_test, w_train, _ = train_test_split(
        X, y, weights, test_size=0.25, random_state=42, stratify=y
    )

    model = LogisticRegression(max_iter=1000, class_weight="balanced")
    model.fit(X_train, y_train, sample_weight=w_train)

    auc = float(roc_auc_score(y_test, model.predict_proba(X_test)[:, 1]))
    coefficients = {name: round(float(c), 4) for name, c in zip(FEATURES, model.coef_[0])}

    print(f"\nROC-AUC: {auc:.4f}  (0.5 = no better than random ordering)")
    print("Learned coefficients:", json.dumps(coefficients, indent=2))
    if auc < 0.6:
        print("\nWeak signal — the ordering barely predicts clicks. Treat with suspicion.")

    # A feature that never varies in the logs carries no information, whatever weight it gets
    constant = [f for f in FEATURES if X[f].nunique() <= 1]
    if constant:
        print("\nNo variance in: " + ", ".join(constant) + " — nothing to learn from these.")
        print("  (distance is only logged for location searches, price fit only with a budget filter)")

    bad = {f: c for f, c in coefficients.items() if c < MIN_COEFFICIENT and f not in constant}
    if bad:
        print("\n" + "=" * 72)
        print("REFUSING TO SAVE — these weights contradict what the features mean:")
        for feature, coefficient in bad.items():
            print(f"    {feature:<12} {coefficient:+.3f}   (expected >= {MIN_COEFFICIENT})")
        print(
            "\nA negative weight on relevance would rank unrelated workers higher. That usually"
            "\nmeans the logged behaviour is confounded — too few distinct workers, or clicks"
            "\ndriven by something these features do not capture — rather than a real signal."
            "\nThe service keeps its hand-set weights, which is the safe outcome."
        )
        print("=" * 72)
        return

    joblib.dump(model, MODEL_PATH, compress=3)
    META_PATH.write_text(
        json.dumps(
            {
                "model": "LogisticRegression",
                "roc_auc": auc,
                "coefficients": coefficients,
                "intercept": float(model.intercept_[0]),
                "features": FEATURES,
                "constant_features": constant,
                "n_rows": len(df),
                "n_positives": positives,
                "hire_weight": HIRE_WEIGHT,
            },
            indent=2,
        ),
        encoding="utf-8",
    )
    print(f"\nModel  -> {MODEL_PATH}")
    print(f"Metrics-> {META_PATH}")


if __name__ == "__main__":
    train()
