# WorkNest AI Service

Stateless FastAPI microservice. It receives JSON, returns predictions, and **never touches
MongoDB** — the Express backend owns all persistence.

```
POST /match/workers   ranking + human-readable reasons   (heuristic)
POST /trust/score     0–100 Trust Score                  (trained model)
POST /price/suggest   fair-price range in PKR            (trained model)
GET  /health          which implementation is live + current model metrics
```

---

## Quick start

```bash
cd ai-service
python -m venv .venv
.venv\Scripts\activate           # Windows   (source .venv/bin/activate elsewhere)
pip install -r requirements.txt

python scripts/build_rate_anchors.py      # wage anchors      -> data/rate_anchors.json
python scripts/generate_price_data.py     # 4.7k rows         -> data/synthetic_prices.csv
python scripts/train_price_model.py       # RandomForest      -> models/price_model.pkl
python scripts/generate_trust_data.py     # 6k rows           -> data/synthetic_trust.csv
python scripts/train_trust_model.py       # GradientBoosting  -> models/trust_model.pkl

uvicorn app.main:app --reload --port 8000  # docs at /docs
```

The whole pipeline takes well under a minute. Run the scripts **from the `ai-service/`
directory** — they resolve paths relative to it.

### The models are build artifacts, not source

`models/*.pkl` and `data/*.csv` are gitignored on purpose: they are generated outputs, and a
59 MB pickle has no business in a git history. What *is* committed is everything needed to
reproduce them byte-for-byte — the scripts, the wage anchors, the fixed seeds, and the
metrics each run produced (`models/*_meta.json`).

**If the model files are missing, nothing breaks.** Each service falls back to a documented
heuristic and `source` in the response says which path answered. `GET /health` reports it too:

```json
{ "backends": { "matching": "dummy", "trust": "gb-worknest-v1", "pricing": "rf-worknest-v1" } }
```

---

## The models

### Fair price — `POST /price/suggest`

RandomForest over one-hot encoded category / city / duration / urgency plus experience.
Predicts the price of **one unit** of the duration (a day, a week, a month); the service
multiplies by `duration_count` and puts a ±18% band around it.

| Metric | Value |
| --- | --- |
| MAE | PKR ~2,100 (9.7% of mean price) |
| R² (overall) | 0.97 |
| R² *within* each duration bucket | ~0.79 |

**Read the second number, not the first.** The headline 0.97 is inflated because predicting
that a month costs more than a day is arithmetic, not learning — `duration_type` carries 87%
of the feature importance for exactly that reason. The within-bucket R² (~0.79) is the honest
measure of what the model adds: category, city, urgency and experience effects.

### Trust Score — `POST /trust/score`

GradientBoosting over the worker's raw platform counters — **the exact payload
`backend/src/services/trust.service.js` already sends**, so nothing is reshaped at request time.

| Metric | Value |
| --- | --- |
| MAE | 2.59 points on a 0–100 scale |
| R² | 0.93 |
| New accounts (no history) | predicted ≈ 53, MAE 2.4 |

Top drivers: `id_verified` (0.26), `repeat_hires` (0.24), `avg_rating` (0.18),
`completed_jobs` (0.12).

Two deliberate design points:

- **A brand-new worker scores ~53, not 0.** 18% of the training rows are fresh accounts with
  zero jobs and zero reviews, so the model learns that "no history" means *unknown*, not *bad*.
  They are labelled `New` regardless of score.
- **`avg_response_minutes` is nullable.** Someone who has never replied has no response time,
  so the model takes an explicit `response_known` flag rather than a magic sentinel value.

### Matching — `POST /match/workers`

Still a transparent heuristic: synonym-expanded lexical similarity blended with trust, rating,
distance and price fit. Swap-in plan is documented at the top of `app/services/matching.py`
(sentence-transformer embeddings + FAISS / Atlas Vector Search).

---

## ⚠️ The training data is synthetic

There is no real booking history pre-launch, so both datasets are generated — openly, in
scripts you can read:

- **Prices** are sampled around `data/rate_anchors.json`: hand-assembled, plausible 2026
  Pakistani daily wages per trade per city. **These are not from a wage survey.** They are a
  documented, inspectable starting point — swap the anchors for real survey data and retrain,
  and nothing else changes.
- **Trust scores** come from a hand-designed formula encoding domain assumptions (completion
  rate and disputes matter most; response time and verification matter less) plus Gaussian
  noise, so the model must learn interactions rather than memorise the formula.

So the models are genuinely trained and genuinely evaluated — but on data whose ceiling is the
assumptions baked into the generators. Once the platform has real bookings, point the training
scripts at that table instead; the feature contract is already identical.

---

## Keeping the vocabulary in sync

`app/taxonomy.py` mirrors `backend/src/constants/index.js` — 18 categories, 12 cities, 3
durations, 3 urgency levels. **If you add a category there, add it here and retrain**,
otherwise that category silently falls back to the heuristic. The test
`test_every_category_and_city_is_supported` fails loudly if coverage regresses.

## Tests

```bash
pip install -r requirements-dev.txt
pytest -q          # 26 tests
```

They assert behaviour — ordering, bounds, full vocabulary coverage, and that the heuristic
fallback still satisfies the contract — rather than exact numbers, so retraining doesn't
produce spurious failures.
