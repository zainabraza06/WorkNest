---
title: WorkNest AI Service
emoji: 🔧
colorFrom: gray
colorTo: orange
sdk: docker
app_port: 8000
pinned: false
short_description: Semantic matching, Trust Score and fair-price models for WorkNest
---

# WorkNest AI Service

Stateless FastAPI microservice. It receives JSON, returns predictions, and **never touches
MongoDB** — the Express backend owns all persistence.

```
POST /match/workers   ranking + human-readable reasons   (local embeddings)
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
python scripts/train_price_model.py       # HistGB (log)      -> models/price_model.pkl
python scripts/generate_trust_data.py     # 6k rows           -> data/synthetic_trust.csv
python scripts/train_trust_model.py       # HistGB (monotonic)-> models/trust_model.pkl

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
{ "backends": { "matching": "dummy", "trust": "gb-worknest-v2-monotonic", "pricing": "gb-worknest-v2" } }
```

---

## The models

### Fair price — `POST /price/suggest`

HistGradientBoosting on **log(price)**, over one-hot encoded category / city / duration /
urgency plus experience. Predicts the price of **one unit** of the duration (a day, a week, a
month); the service multiplies by `duration_count`.

| Metric | Value |
| --- | --- |
| MAE | PKR ~1,640 (**7.5%** of mean price) |
| R² (overall) | 0.98 |
| MAE% *within* each duration bucket | 7.5% / 7.6% / 7.5% |
| **Ceiling** (best achievable) | 6.7–7.1% |
| **% of achievable accuracy captured** | **88–94%** |

**Read the bucket numbers, not the headline.** The overall 0.98 is inflated because predicting
that a month costs more than a day is arithmetic, not learning. What matters is accuracy
*within* a duration — and how close that is to the best any model could do.

**That ceiling is computable here**, which is the useful part. The generator draws each row's
base rate from a ±12% anchor band and then applies ±8% noise, and neither is visible to the
model — so a perfect predictor still lands ~6.9% off. The trainer computes this oracle on every
run and reports the fraction captured, which is how we knew log-space training was worth it:

| Model | Within-bucket MAE% | vs ceiling |
| --- | --- | --- |
| RandomForest on raw price *(first attempt)* | 9.7% | 71% |
| RandomForest on log(price) | 8.5% | 81% |
| **HistGB on log(price)** *(shipped)* | **7.5%** | **88–94%** |

Prices are generated multiplicatively, so their errors are proportional — training in log
space matches the error structure instead of fighting it.

**The ±band is measured, not guessed.** It comes from the 10th/90th percentile of the model's
own residual ratios (×0.889 – ×1.125), verified to cover 80% of actual prices. Earlier it was a
hard-coded ±18%.

### Trust Score — `POST /trust/score`

HistGradientBoosting with **monotonic constraints**, over rates derived from the worker's raw
counters (`app/features.py`). The backend's payload is unchanged — the derivation happens here.

| Metric | Value |
| --- | --- |
| MAE | 2.79 points on a 0–100 scale |
| R² | 0.92 (ceiling: 0.94) |
| New accounts (no history) | predicted ≈ 53, MAE 2.4 |
| **Real-world events provably safe** | **7 / 8** |

Top drivers (permutation importance): `id_verified` (0.51), `rating_norm` (0.26),
`repeat_hires` (0.23), `dispute_rate` (0.14).

#### Why this model is *less* accurate on purpose

An unconstrained model scored slightly better against the synthetic target (R² 0.93 vs 0.92)
but behaved incoherently on the events that actually happen to a worker. Auditing 500 real
profiles against the first version found **216 violations**:

| Event | Unconstrained | Shipped (monotonic) |
| --- | --- | --- |
| Completes a job | **lowered** the score 11.8% of the time | 0 violations |
| Receives a dispute | **raised** it 0.8% of the time | 0 violations |
| Gains a good review | lowered it 4.2% | 0 violations |
| Gets ID verified / adds portfolio / replies slower / repeat hire | 195 violations combined | 0 violations |
| Cancels a job | — | 24/500 (see below) |

A trust score people can *earn* must be monotone: finishing work can never hurt you, and a
dispute can never help you. Trading 0.2 MAE points on a synthetic target for that guarantee is
the right side of the deal — and the guarantee is re-audited on every training run and locked
in by a test.

**The one honest gap:** cancelling a job still nudges 24/500 profiles up slightly, because
cancelling inflates `total_jobs`, which *dilutes* `dispute_rate`. The mean effect is still
correctly negative (−1.06). Removing it entirely means dropping rate-based dispute features,
which costs more than it's worth.

Two further design points:

- **A brand-new worker scores ~53, not 0.** 18% of the training rows are fresh accounts with
  zero jobs and zero reviews, so the model learns that "no history" means *unknown*, not *bad*.
  They are labelled `New` regardless of score.
- **`avg_response_minutes` is nullable.** Someone who has never replied has no response time,
  so the model takes an explicit `response_known` flag rather than a magic sentinel value.
- **Raw counts are derived into rates before prediction.** Monotonic constraints are meaningless
  on counts: `completed_jobs + 1` always arrives with `total_jobs + 1`, so constraining the
  numerator while the denominator moves freely guarantees nothing. See `app/features.py`.

### Matching — `POST /match/workers`

Retrieve-then-rank, in two stages:

1. **Semantic** — `BAAI/bge-small-en-v1.5` (384-dim, ~130 MB) runs locally through
   [fastembed](https://github.com/qdrant/fastembed) on ONNX Runtime. No torch, **no LLM API, no
   API key, no per-request cost.** Worker vectors are cached by content hash, so a repeat query
   costs one embedding (~10 ms) rather than 120.
2. **Re-rank** — that similarity is blended with Trust Score, rating, distance and price fit
   (`WEIGHTS`), then passed through a **relevance gate**.

#### Why an embedding model rather than keywords

Clients describe symptoms; profiles list trades. Measured on nine seeded workers with queries
that deliberately share **no words** with the profile they should match:

| Query | Lexical | Semantic |
| --- | --- | --- |
| "the lights keep tripping when I turn on the heater" | ✗ plumber | ✓ electrician |
| "somebody to look after my mother while I am at work" | ✗ plumber | ✓ carer |
| "I want home made food prepared every evening" | ✗ plumber | ✓ cook |
| **Top-1 accuracy (9 queries)** | **5/9** | **8/9** |

The synonym table is still there and still used — as the **fallback** when the model can't load
(offline, CI, or fastembed not installed). `model` in the response says which ran.

#### The relevance gate

Blending relevance with quality has a failure mode: for "the lights keep tripping", a nearby,
well-rated plumber beat the correct electrician by 0.002 on Trust Score alone. Quality signals
should order results *within* what's relevant, never promote the wrong trade — so a candidate
scoring half the top result's relevance keeps 75% of its score, and one scoring zero keeps 50%.

#### Learning-to-rank — the weights can now be learned

`WEIGHTS` ship as hand-set priors, but there is a full feedback loop behind them:

| Step | Where |
| --- | --- |
| Every search logs what was shown, in what order, with the feature values **at that moment** | `backend` → `SearchImpression` |
| Opening a profile from results labels a weak positive | `POST /api/ranking/events` (`open`) |
| Clicking "Hire" labels a stronger one | `POST /api/ranking/events` (`hire_intent`) |
| An accepted offer labels the strongest | attributed automatically on booking |
| Export → train → serve | `npm run export:ranking` → `python scripts/train_ranker.py` |

```bash
cd backend    && npm run export:ranking     # -> ai-service/data/ranking_events.csv
cd ai-service && python scripts/train_ranker.py
```

When `models/ranker.pkl` exists, `rank()` scores with the fitted logistic regression instead of
the hand-set blend and reports `...+ltr-logreg-v1` in `model`. Until then the priors stand.

**Two guards decide whether a fitted ranker is allowed to ship**, because a bad ranker is worse
than an honest heuristic:

1. **Volume** — under 200 rows / 50 positives it refuses outright.
2. **Direction** — every feature is a "goodness" signal, so a meaningfully negative coefficient
   means the data is confounded, whatever the AUC says.

The second guard is not theoretical. Training on 160 simulated searches produced **ROC-AUC
0.87** — and a **−1.23 weight on semantic relevance**, which would have ranked *unrelated*
workers higher. With only nine seeded workers, the cheapest one is also the highest-rated, so
"cheap" and "well-rated" are indistinguishable, and `distance`/`price_fit` were constant
(they are only logged when a search actually uses location or a budget filter). The trainer
printed exactly that diagnosis and refused to save. That refusal is the feature.

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
pytest -q          # 30 tests
```

They assert behaviour — ordering, bounds, full vocabulary coverage, the monotonicity
guarantee, and that the heuristic fallback still satisfies the contract — rather than exact
numbers, so retraining doesn't produce spurious failures.
