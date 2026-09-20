# WorkNest

**An AI-powered local labor marketplace** that connects skilled workers (plumbers, electricians, house help, painters, cooks…) with clients who need to hire them for a single day, a week, or on a monthly basis.

> Informal labor hiring today runs on word of mouth: no price transparency, no trust signal beyond a personal referral, and no structured way to hire for variable durations. WorkNest adds **structured negotiation**, a composite **Trust Score**, **AI matching** and **fair-price guidance** — with payment held in escrow until the job is done.

Region / currency for this build: **Pakistan · PKR**.

---

## Contents

- [Architecture](#architecture)
- [Features](#features)
- [The AI components](#the-ai-components)
- [What is real vs. simulated](#what-is-real-vs-simulated) ← please read
- [Running it locally](#running-it-locally)
- [Environment variables](#environment-variables)
- [API overview](#api-overview)
- [Data model](#data-model)
- [Tests](#tests)
- [Deployment notes](#deployment-notes)

---

## Architecture

Three independent services. The frontend only ever talks to the Express backend; the backend
is the only thing that touches MongoDB; the AI service is stateless and never sees the database.

```
┌────────────┐   REST + Socket.io   ┌────────────┐    JSON over HTTP   ┌──────────────┐
│  frontend  │ ───────────────────► │  backend   │ ──────────────────► │  ai-service  │
│ React/Vite │ ◄─────────────────── │  Express   │ ◄────────────────── │   FastAPI    │
└────────────┘                      └─────┬──────┘   scores/rankings   └──────────────┘
                                          │                             (stateless)
                                    ┌─────▼──────┐
                                    │  MongoDB   │
                                    │   Atlas    │
                                    └────────────┘
```

| Service      | Stack                                                                  | Owns                                                      | Never does                     |
| ------------ | ---------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------ |
| `frontend/`  | React 19 (Vite), TailwindCSS v4, React Router, TanStack Query, Zustand  | UI, routing, client state                                  | Call the AI service directly   |
| `backend/`   | Node 20+, Express 5, Mongoose, JWT, Socket.io, Stripe, Cloudinary       | Auth, business rules, **all** DB reads/writes, payments    | Import or run Python           |
| `ai-service/`| Python 3.11+, FastAPI, scikit-learn, fastembed (ONNX)                  | Ranking, scoring, price prediction — pure functions of JSON | Touch MongoDB or hold state    |

**Graceful degradation:** if the AI service is unreachable, the backend falls back to MongoDB
text search, a built-in placeholder Trust Score, and simply hides price guidance. A circuit
breaker stops hammering a dead service for 30s. The product keeps working without AI.

### Folder layout

```
WorkNest/
├── frontend/
│   └── src/
│       ├── api/          # typed API client per domain
│       ├── components/   # ui/ forms/ layout/ jobs/ workers/ negotiation/ booking/ pricing/
│       ├── pages/        # route-level screens
│       ├── realtime/     # socket client + event→cache bridge
│       ├── hooks/  lib/  stores/
├── backend/
│   └── src/
│       ├── config/       # env validation, db, cloudinary
│       ├── controllers/  routes/  validators/   # one file per domain
│       ├── models/       # Mongoose schemas
│       ├── services/     # payment, booking, trust, upload, ai client
│       ├── socket/       # Socket.io server
│       └── scripts/      # seed
└── ai-service/
    └── app/
        ├── routers/      # /match /trust /price
        ├── services/     # matching (heuristic), trust + pricing (trained models)
        ├── taxonomy.py   # mirrors backend constants — models are trained on this vocabulary
        └── schemas.py    # the contract with the backend
    ├── scripts/          # generate data + train models (models themselves are gitignored)
    ├── data/             # rate_anchors.json (committed) + generated CSVs (ignored)
    └── models/           # *.pkl (ignored) + *_meta.json metrics (committed)
```

---

## Features

### Auth & profiles
- JWT auth, role chosen at signup (**worker** / **client**), role-guarded routes on both ends.
- Worker profile: skills, categories, hourly/daily/monthly rates, geo location + service radius,
  weekly availability, bio, portfolio images, CNIC verification.
- Client profile: location, address (only shared after a booking is paid), job history.
- Uploads go to Cloudinary. **ID documents are uploaded as `authenticated` assets** and are never
  public — clients only ever see a "verified" badge; admins view them through a short-lived signed URL.

### Job posting & discovery
- Progressive four-step job form (the job → timing → location → budget) with a fair-price hint.
- Client-side discovery: natural-language search, category / city / rate / Trust Score / verified /
  availability filters, distance radius, and six sort orders — plus the AI **Smart match** toggle.
- Worker-side job feed with "only within my service area", keyword search and budget filters.
- Geospatial queries use a `2dsphere` index; keyword search uses weighted MongoDB text indexes.

### Negotiation & booking
- **Structured offers, not just chat.** Every proposal is a round on the `Offer` document
  (amount, duration, start date, terms), so the UI can render offer cards and both sides always
  know whose turn it is. Turn-taking is enforced server-side.
- Real-time chat per negotiation thread (Socket.io) with typing indicators, read receipts and
  unread counts. Messages are created over REST (validated, persisted) and *broadcast* over sockets.
- Accepting an offer atomically confirms the job, creates the booking and closes competing offers.
- Job lifecycle: `posted → negotiating → confirmed → in_progress → completed → reviewed`
  (plus `cancelled`). If a worker cancels, the job reopens and the other offers come back to life.

### Payments (escrow)
- Stripe **test mode** PaymentIntents with `capture_method: manual`:
  `requires_payment → held (authorised) → released (captured)` or `refunded (cancelled)`.
- Contact details and the exact address are revealed only once payment is held in escrow.
- Webhook (`/api/payments/webhook`, raw-body mounted before `express.json`) plus a manual
  "sync" endpoint so local development works without the Stripe CLI.
- 5% platform fee is deducted from the worker payout and shown transparently on both sides.
- Disputes freeze the escrow; an admin endpoint resolves them by releasing or refunding.

### Reviews & trust
- Two-sided reviews after a completed booking, with optional quality/punctuality/communication detail.
- Ratings feed the worker's stats, which feed the Trust Score, which feeds search ranking.

### UI/UX
- Design tokens in `frontend/src/index.css`: near-black ink neutrals with a single hi-vis orange
  accent (a nod to workwear), Archivo for display type with negative tracking, tight 3–12px radii
  and hairline borders — no ad-hoc colours or font sizes.
- Motion is functional, not decorative: scroll reveals, hover lift on cards, animated trust rings,
  all disabled under `prefers-reduced-motion`.
- Mobile-first: bottom tab bar on phones, sidebar filters on desktop, 44px touch targets.
- Accessibility: semantic landmarks, labelled form controls with `aria-describedby` errors,
  keyboard-navigable menus, native `<dialog>` modals (focus trapping for free), skip link,
  `aria-live` result counts, visible focus rings, reduced-motion support.
- Deliberate loading (skeletons), empty and error states on every async screen.

---

## The AI components

All three are exposed by the FastAPI service and consumed by Express.

### 1. Matching & ranking — `POST /match/workers`
MongoDB shortlists up to 120 workers on the hard filters; the AI service scores that shortlist
against the client's own words and returns an ordering plus human-readable reasons
("Skills match what you described", "Only 4 km away").

Relevance comes from a **local sentence-embedding model** (`BAAI/bge-small-en-v1.5` via
fastembed/ONNX) — **no LLM API, no API key, no per-request cost**, ~10 ms per cached query. That
is what lets "the lights keep tripping when I turn on the heater" find an electrician with no
shared keywords: **8/9 top-1 accuracy vs 5/9** for the keyword baseline it replaced. Without the
model (offline/CI) it falls back to a synonym-expanded lexical scorer.

Relevance is then blended with Trust Score, rating, distance and price fit
(`0.45·semantic + 0.18·trust + 0.15·rating + 0.12·distance + 0.10·price`) and passed through a
**relevance gate**, so a well-rated plumber can never outrank an electrician on an electrical
job.

Those blend weights are **hand-set priors with a working feedback loop behind them**. Every
search logs what was shown and on which feature values; opening a profile, clicking "Hire" and
an accepted offer are progressively stronger labels; `npm run export:ranking` plus
`train_ranker.py` fit a logistic regression on the result. Once trained, the service ranks with
the learned weights and says so in `model`.

It ships with two guards — a volume floor, and a **direction check** that refuses any ranker
whose weights contradict what the features mean. That guard already earned its place: a run on
160 simulated searches scored ROC-AUC 0.87 while putting a *negative* weight on relevance, and
was correctly rejected. See `ai-service/README.md` for why.

### 2. Trust Score — `POST /trust/score`
A **trained HistGradientBoosting regressor with monotonic constraints** (MAE 2.79 on a 0–100
scale, R² 0.92 against a 0.94 ceiling) over rates derived from the worker's counters: completion,
ratings, repeat hires, response time, disputes, account age, ID verification and portfolio.

It is deliberately *slightly less accurate* than an unconstrained model, in exchange for a
guarantee: **7 of the 8 events a worker can experience are provably safe** — completing a job can
never lower the score, a dispute can never raise it. The unconstrained version violated that in
216 of 500 audited profiles. The audit runs on every training run and is locked in by a test.

A brand-new worker scores ≈53 and is labelled "New" — 18% of training rows are fresh accounts, so
the model learns that no history means *unknown*, not *bad*. Recomputed automatically on
completion, cancellation, dispute, new review and ID verification.

### 3. Fair price — `POST /price/suggest`
A **trained HistGradientBoosting on log(price)** over category, city, duration, urgency and
experience, returning a min/median/max PKR range. Shown in the job form, the offer form, the
counter-offer modal and the worker's rate settings; snapshotted onto each job at posting time.

The headline R² of 0.98 is flattered by the fact that a month obviously costs more than a day.
The honest number is accuracy **within** a duration bucket: **7.5% MAE**, against a computable
ceiling of ~6.9% — so it captures **88–94% of the achievable accuracy**. (The ceiling exists
because each row's base rate is drawn from a ±12% band the model never sees.) Training in log
space rather than on raw prices took within-bucket MAE from 9.7% → 7.5%, and the ± band is
calibrated from the model's own residuals instead of a hard-coded percentage. All recorded in
`ai-service/models/price_model_meta.json`.

### 4. Negotiation assistant — *not built*
The stretch goal (fine-tuned small LLM for counter-offer suggestions) was intentionally left out;
the three above are solid and the LLM was the riskiest, least essential piece. **It is also the
only feature here that would need an LLM at all** — search uses embeddings, which are a different
kind of model entirely.

---

## What is real vs. simulated

Being explicit about this, since it is a student/portfolio project:

| Area | Status |
| --- | --- |
| **Auth, profiles, jobs, negotiation, bookings, reviews, realtime chat** | **Real.** Full implementation against MongoDB, covered by tests. |
| **Payments** | **Stripe test mode only.** `backend/src/config/env.js` *rejects any key that doesn't start with `sk_test_`*, and the frontend refuses a publishable key that isn't `pk_test_`. No real money can move. Use card `4242 4242 4242 4242`. |
| **AI models** | **Trained for trust + pricing, heuristic for matching.** Every endpoint falls back to a documented heuristic if its model file is absent, and the `source` field in each response says which path answered. |
| ↳ matching | **Real local embeddings** (bge-small via ONNX, no API). 8/9 top-1 vs 5/9 lexical. Blend weights are hand-set priors; the learning-to-rank loop that replaces them is built and gated, awaiting real usage. |
| ↳ trust | **Trained** HistGradientBoosting, monotonic (R² 0.92, MAE 2.79 pts) — 7/8 worker events provably safe. |
| ↳ pricing | **Trained** HistGradientBoosting on log(price), 7.5% MAE — 88–94% of the computable ceiling. |
| ↳ ranking | **Trained on real behaviour** once the app is used — nothing synthetic. Logged impressions → clicks/hires → logistic regression. |
| ↳ **training data (price & trust)** | **Synthetic — this is the real caveat.** No booking history exists pre-launch, so prices are sampled around hand-assembled 2026 Pakistani wage anchors (`ai-service/data/rate_anchors.json` — **not** a wage survey) and trust targets come from a documented formula plus noise. The models are genuinely trained and evaluated, but their ceiling is the assumptions in the generators. Point the scripts at real bookings later — the feature contract is already identical. |
| **ID verification** | Documents really are uploaded and stored privately, but approval is a manual admin endpoint — no automated document checks. |
| **Cloudinary** | Real, but optional: upload endpoints return a clear 503 if credentials are absent, so the rest of the app runs without them. |

---

## Running it locally

### With Docker (one command)

```bash
cp backend/.env.example backend/.env    # fill in MONGODB_URI and JWT_SECRET
docker compose up --build
# web http://localhost:8080 · api :5000 · ai :8000/docs
```

The AI image **bakes the models in** — no training at deploy, no model download at boot, and the
build fails if the committed models don't load or fail their checksum. See
**[DEPLOYMENT.md](DEPLOYMENT.md)** for how models are pinned, validated and hosted.

### Without Docker

**Prerequisites:** Node 20+, Python 3.11+, a MongoDB Atlas connection string (or a local `mongod`).

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env        # then fill in MONGODB_URI and JWT_SECRET
npm run seed                # optional: demo workers, jobs, a negotiation and a booking
npm run dev                 # http://localhost:5000
```

Generate a JWT secret with:
`node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`

### 2. AI service

```bash
cd ai-service
python -m venv .venv
.venv\Scripts\activate          # Windows  (source .venv/bin/activate elsewhere)
pip install -r requirements.txt

# Build the models (gitignored artifacts — under a minute, deterministic seeds)
python scripts/build_rate_anchors.py
python scripts/generate_price_data.py && python scripts/train_price_model.py
python scripts/generate_trust_data.py && python scripts/train_trust_model.py

uvicorn app.main:app --reload   # http://localhost:8000  ·  docs at /docs
```

Skip the training step and the service still answers — it falls back to the heuristics and says
so in `GET /health`. The backend works without the service at all: set `AI_ENABLED=false`.
See `ai-service/README.md` for metrics and retraining details.

### 3. Frontend

```bash
cd frontend
npm install
cp .env.example .env        # optional; only needed for the Stripe test key
npm run dev                 # http://localhost:5173
```

Vite proxies `/api` and `/socket.io` to port 5000, so no CORS setup is needed in development.

### Demo accounts (after `npm run seed`)

| Email | Role | Notes |
| --- | --- | --- |
| `client1@worknest.test` | Client | Lahore; has an open negotiation waiting on a reply |
| `worker1@worknest.test` | Worker | Electrician, strong history, ID verified |
| `worker9@worknest.test` | Worker | Brand new — shows the "New" Trust Score state |
| `admin@worknest.test` | Admin | Can view ID documents and resolve disputes |

Password for all: `Password123`

### Stripe webhook (optional)

```bash
stripe listen --forward-to localhost:5000/api/payments/webhook
```

Without it, the client's browser calls `POST /api/bookings/:id/payment/sync` after confirming
the card, which reconciles the same state.

---

## Environment variables

Never commit real values — `.env` is gitignored and `.env.example` is the template.

**`backend/.env`**

| Variable | Required | Notes |
| --- | --- | --- |
| `MONGODB_URI` | ✅ | Atlas connection string |
| `JWT_SECRET` | ✅ | ≥ 16 chars |
| `PORT`, `CLIENT_URL`, `NODE_ENV` | | Defaults: 5000, `http://localhost:5173`, development |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | | Uploads return 503 without them |
| `STRIPE_SECRET_KEY` | | **Must** start with `sk_test_` — validated at boot |
| `STRIPE_WEBHOOK_SECRET`, `STRIPE_CURRENCY` | | `pkr` by default |
| `AI_SERVICE_URL`, `AI_SERVICE_KEY`, `AI_ENABLED`, `AI_SERVICE_TIMEOUT_MS` | | AI service connection |

**`ai-service/.env`** — `ALLOWED_ORIGINS`, `SERVICE_API_KEY` (must match `AI_SERVICE_KEY`).

**`frontend/.env`** — `VITE_API_URL` (blank in dev), `VITE_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`).

---

## API overview

All responses are `{ success, data }` or `{ success: false, message, details? }`.

| Method | Endpoint | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register`, `/api/auth/login` | Signup / signin (rate-limited) |
| `GET` | `/api/auth/me` | Current user + profile |
| `POST/PATCH` | `/api/workers/me`, `/api/clients/me` | Profile CRUD |
| `POST` | `/api/workers/me/portfolio`, `/me/id-verification`, `/api/users/me/avatar` | Uploads |
| `GET` | `/api/workers` | Discovery — filters, sorting, `mode=smart` for AI ranking |
| `GET` | `/api/workers/:userId` | Public worker profile + recent reviews |
| `GET/POST` | `/api/jobs` | Browse / post jobs |
| `PATCH/POST` | `/api/jobs/:id`, `/api/jobs/:id/cancel` | Edit / cancel |
| `POST` | `/api/jobs/:id/offers` | Worker opens a negotiation |
| `GET` | `/api/offers`, `/api/offers/:id` | Negotiation inbox / thread |
| `POST` | `/api/offers/:id/counter`, `/accept`, `/reject`, `/withdraw` | Structured negotiation |
| `GET/POST` | `/api/offers/:id/messages`, `/read` | Chat |
| `GET` | `/api/bookings`, `/api/bookings/:id` | Bookings |
| `POST` | `/api/bookings/:id/payment`, `/payment/sync` | Escrow |
| `POST` | `/api/bookings/:id/start`, `/complete`, `/cancel`, `/dispute`, `/resolve` | Lifecycle |
| `POST` | `/api/bookings/:id/reviews` | Review after completion |
| `GET` | `/api/users/:userId/reviews` | Public reviews |
| `GET` | `/api/price/suggest` | Fair-price guidance |
| `POST` | `/api/ranking/events` | Labels a search result (open / hire intent) for the ranker |
| `POST` | `/api/payments/webhook` | Stripe (raw body) |

**Socket.io events** — client → server: `thread:join`, `thread:leave`, `thread:typing`;
server → client: `offer:new`, `offer:updated`, `message:new`, `thread:activity`, `thread:typing`,
`thread:read`, `booking:updated`, `review:new`.

---

## Data model

`User` (auth + role) · `WorkerProfile` (skills, rates, geo, availability, portfolio, ID verification,
stats, trustScore) · `ClientProfile` · `Job` (budget, duration, geo, status, suggestedPrice) ·
`Offer` (the negotiation thread — `rounds[]` of structured proposals) · `Booking` (agreed terms,
status timeline) · `Payment` (escrow state) · `Review` (two-sided) · `Message` (text / offer / system) ·
`SearchImpression` (ranker training data: results shown, their features at that moment, and what
the client did next — TTL 180 days).

Indexes: `2dsphere` on worker, client and job locations; weighted text indexes on worker
(`skills` ×5, `headline` ×3, `bio`) and job (`title` ×5, `skills` ×4, `description`);
compound indexes for the common filter/sort paths; unique `(job, worker)` on offers and
`(booking, from)` on reviews.

---

## Tests

```bash
cd backend    && npm test      # 48 tests — auth, profiles, jobs, negotiation, escrow, reviews, AI, ranking loop
cd ai-service && pytest -q     # 30 tests — semantic matching, trust, pricing, coverage, monotonicity, fallbacks
cd frontend   && npm run build # type/JSX + bundling check

cd ai-service && python scripts/validate_models.py   # the promotion gate CI enforces
```

Backend tests run against an in-memory MongoDB (`mongodb-memory-server`, downloaded on first run)
with Stripe, Cloudinary and the AI client mocked — no external services, no test keys needed.

---

## Deployment notes

Full guide: **[DEPLOYMENT.md](DEPLOYMENT.md)**. In short:

- **Backend** → Render / Railway / Fly (Dockerfile provided). Set all env vars; the process
  validates them at boot and exits with a readable error if anything is missing.
- **AI service** → any Docker host. 512 MB RAM is enough (measured: 152 MB steady, 351 MB peak).
  Models and the embedding model ship inside the image, so cold starts don't download anything.
- **Database** → MongoDB Atlas free tier. Create the indexes by letting Mongoose sync on first boot.
- **Frontend** → any static host; set `VITE_API_URL` to the deployed backend origin.
- Set `CLIENT_URL` to the deployed frontend origin (comma-separated for multiple) so CORS and
  Socket.io accept it.

### Known limitations

- Stripe card authorisations expire after ~7 days, so a month-long booking would need Stripe
  Connect with separate charges & transfers in a real deployment.
- Offer acceptance uses atomic conditional updates rather than multi-document transactions
  (the free Atlas tier supports transactions; the in-memory test server does not).
- Dispute resolution is a manual admin endpoint with no UI.
