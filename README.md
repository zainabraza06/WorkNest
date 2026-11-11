# WorkNest

**An AI-powered local labor marketplace** that connects skilled workers (plumbers, electricians, house help, painters, cooks…) with clients who need to hire them for a single day, a week, or on a monthly basis.

> Informal labor hiring today runs on word of mouth: no price transparency, no trust signal beyond a personal referral, and no structured way to hire for variable durations. WorkNest adds **structured negotiation**, a composite **Trust Score**, **AI matching** and **fair-price guidance** — with payment held in escrow until the job is done.

Region / currency for this build: **Pakistan · PKR**.

**Live:** [work-nest-z.vercel.app](https://work-nest-z.vercel.app) ·
API [worknest-qicp.onrender.com](https://worknest-qicp.onrender.com/api/health) ·
AI service [worknest-ai.onrender.com](https://worknest-ai.onrender.com/health)

> Both backends are on Render's free tier and sleep after ~15 minutes idle. The first request
> takes ~50s to wake them. Sign in with `client1@worknest.test` / `Password123`.

---

## Mobile app and production docs

- **Mobile** (`flutter_app/`): Flutter client for clients and workers on the same API as the web
  app: jobs, negotiation chat, bookings, earnings, notifications. Run it with
  `flutter run --dart-define=API_URL=http://10.0.2.2:5000` (Android emulator to local API);
  release builds sign from `android/key.properties` (see `docs/RUNBOOK.md`).
- [Architecture and scaling plan](docs/ARCHITECTURE.md)
- [Monitoring: metrics, alerts, logs](docs/MONITORING.md)
- [Runbook: deploy, rollback, incidents, backups](docs/RUNBOOK.md)
- [Security controls and known gaps](docs/SECURITY.md)
- [Performance and scale testing: measured load, stress and end-to-end results](docs/PERFORMANCE.md)
- `scripts/smoke-test.sh` (post-deploy checks), `loadtest/k6-api.js` (latency budgets)

## Tech stack

| Layer | Technology |
| --- | --- |
| **Web** | React 19, Vite, Tailwind CSS v4, React Router, TanStack Query, Zustand, Axios, Socket.io client, Stripe Elements, Lucide icons |
| **Mobile** | Flutter 3 (Android/iOS), Provider, `flutter_secure_storage` (Keychain/Keystore), `http` client with retry, animated CustomPaint logo |
| **API** | Node.js, Express 5, Mongoose 9, Zod validation, JWT (with `tokenVersion` revocation), bcrypt, Socket.io, Multer |
| **AI service** | Python, FastAPI, Pydantic, scikit-learn, fastembed (semantic embeddings), pandas, joblib |
| **Data** | MongoDB Atlas (replica set, 2dsphere + text indexes), Redis (Upstash) for shared rate limits and the Socket.io adapter |
| **Payments / media** | Stripe (test mode, escrow via manual capture), Cloudinary (images and signed private ID documents) |
| **Observability** | pino structured logs with request ids, Prometheus metrics (`/metrics`), Grafana dashboard, Alertmanager rules, optional Sentry |
| **Security** | helmet (strict API CSP), CORS allow-list, per-IP and per-account rate limiting, env guard in production, gitleaks, Trivy, `npm audit` gate, Dependabot |
| **Testing** | Vitest + Supertest + mongodb-memory-server (API), Vitest + Testing Library (web), pytest (AI), `flutter test`, k6 load profile, post-deploy smoke test |
| **DevOps** | Docker (non-root, read-only, patched images), docker-compose (+ observability overlay), GitHub Actions CI, Render blueprint (`render.yaml`), Vercel |
| **Hosting** | Vercel (web), Render (API + AI service), MongoDB Atlas, Upstash Redis |

---

## Screenshots

Captured from the live deployment.

| | |
| --- | --- |
| ![Landing](docs/screenshots/01-landing.png) | ![Discover workers](docs/screenshots/02-discover-workers.png) |
| **Landing** | **Discover workers** (AI-ranked, Trust Score) |
| ![Worker profile](docs/screenshots/03-worker-profile.png) | ![Login](docs/screenshots/04-login.png) |
| **Worker profile** | **Sign in** (animated logo) |
| ![Client dashboard](docs/screenshots/05-client-dashboard.png) | ![Post a job with fair price guide](docs/screenshots/06-post-job-fair-price.png) |
| **Client dashboard** | **Post a job** with the AI fair-price guide |
| ![Negotiations](docs/screenshots/07-negotiations.png) | ![Bookings](docs/screenshots/08-bookings.png) |
| **Negotiations** | **Bookings history** (worker view) |
| ![Worker: browse jobs](docs/screenshots/09-worker-browse-jobs.png) | ![Worker earnings](docs/screenshots/10-worker-earnings.png) |
| **Worker: browse jobs** | **Worker earnings and payouts** |
| ![Admin console](docs/screenshots/11-admin-console.png) | ![AI service OpenAPI](docs/screenshots/12-ai-service-openapi.png) |
| **Admin console** | **AI service** (FastAPI OpenAPI docs) |
| ![Grafana dashboard under load](docs/screenshots/13-grafana-dashboard.png) | ![Prometheus alert rules](docs/screenshots/14-prometheus-alerts.png) |
| **Grafana** during a 400-user stress run | **Prometheus** alert rules |

### Mobile app (Flutter, running on an Android emulator against the live API)

<p>
  <img src="docs/screenshots/mobile/01-login.png" width="170" alt="Login">
  <img src="docs/screenshots/mobile/02-home.png" width="170" alt="Client home">
  <img src="docs/screenshots/mobile/03-find-workers.png" width="170" alt="Find workers">
  <img src="docs/screenshots/mobile/04-worker-profile.png" width="170" alt="Worker profile">
  <img src="docs/screenshots/mobile/06-negotiation.png" width="170" alt="Negotiation">
</p>
<p>
  <img src="docs/screenshots/mobile/07-post-job.png" width="170" alt="Post a job">
  <img src="docs/screenshots/mobile/05-offers.png" width="170" alt="Offers">
  <img src="docs/screenshots/mobile/09-account.png" width="170" alt="Account">
  <img src="docs/screenshots/mobile/10-worker-home.png" width="170" alt="Worker home with earnings">
  <img src="docs/screenshots/mobile/11-worker-find-jobs.png" width="170" alt="Worker: find jobs">
  <img src="docs/screenshots/mobile/12-server-waking.png" width="170" alt="Server waking up notice">
  <img src="docs/screenshots/mobile/13-server-ready-continue.png" width="170" alt="Server is up, continue">
</p>

---

## Contents

- [Tech stack](#tech-stack)
- [Screenshots](#screenshots)
- [Architecture](#architecture)
- [Features](#features)
- [Money: escrow, payouts and disputes](#money-escrow-payouts-and-disputes)
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

### Hiring, in both directions
- **Post a job** and let workers bid on it, or **hire one worker directly** from their profile.
  A direct hire is a private request: the job is excluded from browse, no other worker may bid,
  and the request *is* the client's opening offer — so the worker accepts or counters through
  the same negotiation, rather than a second mechanism existing for the same conversation.

### Negotiation & booking
- **Structured offers, not just chat.** Every proposal is a round on the `Offer` document
  (amount, duration, start date, terms), so the UI can render offer cards and both sides always
  know whose turn it is. Turn-taking is enforced server-side.
- Real-time chat per negotiation thread (Socket.io) with typing indicators, read receipts and
  unread counts. Messages are created over REST (validated, persisted) and *broadcast* over sockets.
- Accepting an offer atomically confirms the job, creates the booking and closes competing offers.
- Job lifecycle: `posted → negotiating → confirmed → in_progress → completed → reviewed`
  (plus `cancelled`). If a worker cancels, the job reopens and the other offers come back to life.
- **Before work starts**, either side can cancel outright and the escrow is released.
  **Once work has started, neither side can walk away alone** — one requests, the other answers.
  Accepting refunds the client in full; declining opens a dispute rather than forcing the work on.
  An agreed cancellation is attributed to whoever asked, so a worker cannot dodge the Trust Score
  consequence by getting the client to click the button.

### Notifications
- Everything that happens to you is recorded, not just pushed: a bell in the header with an
  unread count, covering hire requests, bids, counters, accepts, messages, every booking state
  change, reviews received and ID decisions.
- A socket event only reaches someone who is connected at that instant. These survive being
  offline, expire after 90 days, and carry a link to the resource rather than a copy of it.

### Payments (escrow)
- Stripe **test mode** PaymentIntents with `capture_method: manual`:
  `requires_payment → held (authorised) → released (captured)` or `refunded (cancelled)`.
- Because capture is manual, held money is only ever an **authorisation**. Cancelling voids it,
  so the card is never charged and there is no refund to wait for.
- Contact details and the exact address are revealed only once payment is held in escrow.
- Webhook (`/api/payments/webhook`, raw-body mounted before `express.json`) plus a manual
  "sync" endpoint so local development works without the Stripe CLI.
- 5% platform fee is deducted from the worker payout and shown transparently on both sides.

### Admin console
- The two decisions only staff can make: **ID verification** and **disputed escrow**.
- Queues for each, plus a platform summary counted from the collections rather than stored, so
  it cannot drift from what the rest of the app reports.
- The CNIC never appears in a list response — the queue reports only whether a document exists,
  and the image is fetched through a short-lived signed URL when an admin opens it.

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

## Money: escrow, payouts and disputes

The part of a marketplace that has to be honest about what it can and cannot do.

### The escrow ladder

```
client pays  ──►  held (authorised, not charged)  ──►  released (captured)   worker is owed it
                        │                         └─►  refunded (voided)     client keeps it
                        └─ a dispute freezes it here until an admin decides
```

### Worker payouts — settled outside Stripe, deliberately

Escrow captures into the **platform's** Stripe account. Paying that on to the worker is normally
Stripe Connect's job, and **Connect is not available for Pakistan**. Rather than put a Withdraw
button on a screen and have it do nothing, the last leg is modelled as what it would really be: a
bank or wallet transfer made by hand, requested by the worker and recorded by an admin against a
transaction reference.

Workers get an **Earnings** page — available, in escrow, withdrawn, lifetime — where every figure
is summed from `Payment` and `Withdrawal` rows on each read. **No running balance is stored**: a
cached total that drifts from the records behind it is worse than no total, and this is money.

Two things hold the accounting together:

- **One open request per worker, enforced by a partial unique index** rather than a read-then-check.
  Two requests sent together both read the same available balance and both pass validation — the
  index is what stops the second being written. There is a test that fires them concurrently.
- **Settling is an atomic `findOneAndUpdate` on `status: requested`**, so two admins cannot pay the
  same request twice.

Payout details are snapshotted onto each request: changing your account number must never rewrite
where an already-paid withdrawal went. They are stripped from the public profile projection, masked
in the worker's own history, and shown in full only to the admin who has to make the transfer.

### Disputes — a case, not a claim

A dispute used to carry one sentence from the client. The worker was never asked, nothing could be
shown, and the negotiation thread was invisible to admins. Money changed hands on a single
unanswered claim.

| | Before | Now |
| --- | --- | --- |
| Client's case | one sentence | statement + up to 5 photographs |
| Worker's case | — | statement + photographs, and they are notified there is something to answer |
| Their conversation | invisible to the admin | readable in the console |
| Decision reason | optional | **required**, stored on the booking, shown to both parties |

**Admins read; they do not participate.** They are allowed past the role guard on the two *read*
routes only, and the controller hands them a `null` role — so every "is it my turn" check still
refuses them. An admin cannot counter an offer or post in a thread, and there are tests that say so.

Evidence photographs are ordinary Cloudinary images, not signed private assets: these are pictures
of work and both parties are entitled to see them. Identity documents stay private and admin-only.

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
| **Worker payouts** | **Real ledger, manual settlement.** Balances are derived from real `Payment` rows and withdrawal requests are real records with real guards. The transfer itself happens outside the app, because Stripe Connect is unavailable for Pakistan — an admin marks it paid against a reference. Nothing pretends money moved automatically. |
| **Disputes** | **Real.** Both sides submit statements and photographs, admins read the negotiation thread as evidence, and the decision is recorded with a required reason. Resolution moves the actual Stripe authorisation. |
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
| `worker2@worknest.test` | Worker | Plumber, 58 paid jobs — has earnings and a withdrawal waiting |
| `admin@worknest.test` | Admin | ID verification, disputes and the payout queue |

Password for all: `Password123`

`npm run seed` also back-fills the history those profiles claim: ~238 completed and cancelled
bookings with their escrow records, 188 reviews from 42 past clients, and the counters recomputed
from those documents afterwards — so a profile reports its numbers rather than asserting them.
It leaves one pending ID verification, one dispute with both sides on record, and one withdrawal
request, so none of the admin queues open empty.

> `npm run seed` **wipes every collection first.** It refuses when `NODE_ENV=production`, which
> is not true when you run it from your own machine against a deployed database — so check what
> is in there before running it.

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
| `JWT_SECRET` | ✅ | ≥ 16 chars (**≥ 32 in production**, enforced at boot) |
| `PORT`, `CLIENT_URL`, `NODE_ENV` | | Defaults: 5000, `http://localhost:5173`, development |
| `CLOUDINARY_CLOUD_NAME` / `_API_KEY` / `_API_SECRET` | | Uploads return 503 without them |
| `STRIPE_SECRET_KEY` | | **Must** start with `sk_test_` — validated at boot |
| `STRIPE_WEBHOOK_SECRET`, `STRIPE_CURRENCY` | | `pkr` by default |
| `AI_SERVICE_URL`, `AI_SERVICE_KEY`, `AI_ENABLED`, `AI_SERVICE_TIMEOUT_MS` | | AI service connection |
| `REDIS_URL` | | `redis://` / `rediss://`. Shares rate-limit counters and Socket.io rooms across instances; unset = in-memory, single instance. A Redis outage fails open |
| `KEEP_ALIVE` | | `true` makes the API ping its own public URL and the AI service every `KEEP_ALIVE_INTERVAL_SEC` (default 600) so Render's free tier never idles them. Default off. Also `KEEP_ALIVE_HOURS` (e.g. `8-20`, in `KEEP_ALIVE_TZ`, default `Asia/Karachi`) to let the services sleep outside a daily window; see [Keeping free-tier services awake](docs/MONITORING.md#keeping-free-tier-services-awake) |
| `METRICS_TOKEN` | prod | Bearer token for `GET /metrics` (≥ 16 chars). Without it the endpoint is closed in production |
| `SENTRY_DSN`, `SENTRY_TRACES_SAMPLE_RATE` | | Error tracking; off when unset |
| `LOG_LEVEL`, `TRUST_PROXY_HOPS`, `DB_MAX_POOL_SIZE`, `SHUTDOWN_TIMEOUT_MS` | | Defaults: info, 1 (Render), 20, 15000 |

**`ai-service/.env`** — `ALLOWED_ORIGINS`, `SERVICE_API_KEY` (must match `AI_SERVICE_KEY`).

**`frontend/.env`** — `VITE_API_URL` (blank in dev), `VITE_STRIPE_PUBLISHABLE_KEY` (`pk_test_…`).
In the Docker image, `API_ORIGIN` (runtime) feeds the Content-Security-Policy `connect-src`.

**Mobile** — build-time `--dart-define=API_URL=…` and `WEB_URL=…` (see `flutter_app/lib/core/config.dart`).

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
| `POST` | `/api/jobs` with `invitedWorker` + `offerAmount` | **Hire one worker directly** — private job + opening offer |
| `POST` | `/api/jobs/:id/offers` | Worker opens a negotiation |
| `GET` | `/api/offers`, `/api/offers/:id` | Negotiation inbox / thread |
| `POST` | `/api/offers/:id/counter`, `/accept`, `/reject`, `/withdraw` | Structured negotiation |
| `GET/POST` | `/api/offers/:id/messages`, `/read` | Chat |
| `GET` | `/api/bookings`, `/api/bookings/:id` | Bookings |
| `POST` | `/api/bookings/:id/payment`, `/payment/sync` | Escrow |
| `POST` | `/api/bookings/:id/start`, `/complete`, `/cancel` | Lifecycle (cancel only before work starts) |
| `POST` | `/api/bookings/:id/cancellation`, `/cancellation/respond` | Mutual cancellation of work already under way |
| `POST` | `/api/bookings/:id/dispute`, `/dispute/statements` | Open a dispute / add a statement (multipart, photos) |
| `POST` | `/api/bookings/:id/resolve` | Admin decides — outcome + required reason |
| `POST` | `/api/bookings/:id/reviews` | Review after completion |
| `GET` | `/api/users/:userId/reviews` | Public reviews |
| `GET` | `/api/price/suggest` | Fair-price guidance |
| `POST` | `/api/ranking/events` | Labels a search result (open / hire intent) for the ranker |
| `GET/POST` | `/api/notifications`, `/notifications/read` | Notification inbox and read state |
| `GET` | `/api/withdrawals/earnings` | Worker balances, payments and withdrawal history |
| `PUT` | `/api/withdrawals/method` | Bank / Easypaisa / JazzCash details |
| `GET/POST` | `/api/withdrawals` | Request a withdrawal · worker's own list · admin queue |
| `POST` | `/api/withdrawals/:id/settle` | Admin marks paid (reference required) or rejects |
| `GET` | `/api/admin/overview`, `/verifications`, `/disputes` | Admin console queues and summary |
| `POST` | `/api/payments/webhook` | Stripe (raw body) |

**Socket.io events** — client → server: `thread:join`, `thread:leave`, `thread:typing`;
server → client: `offer:new`, `offer:updated`, `message:new`, `thread:activity`, `thread:typing`,
`thread:read`, `booking:updated`, `review:new`, `notification:new`, `earnings:updated`.

`earnings:updated` is emitted from post-save hooks on `Payment` and `Withdrawal` rather than at
each call site — a payment's status changes in seven places, and one of them being forgotten would
leave a worker looking at a stale balance.

---

## Data model

`User` (auth + role) · `WorkerProfile` (skills, rates, geo, availability, portfolio, ID verification,
stats, trustScore, **payoutMethod**) · `ClientProfile` · `Job` (budget, duration, geo, status,
suggestedPrice, **invitedWorker** for a direct hire) · `Offer` (the negotiation thread — `rounds[]`
of structured proposals) · `Booking` (agreed terms, status timeline, **cancellationRequest**,
**dispute** with statements, evidence and the resolution) · `Payment` (escrow state) ·
`Withdrawal` (a worker asking to be paid, with the payout details snapshotted onto it) ·
`Review` (two-sided) · `Message` (text / offer / system) · `Notification` (what happened while you
were away — TTL 90 days) · `SearchImpression` (ranker training data: results shown, their features
at that moment, and what the client did next — TTL 180 days).

Indexes: `2dsphere` on worker, client and job locations; weighted text indexes on worker
(`skills` ×5, `headline` ×3, `bio`) and job (`title` ×5, `skills` ×4, `description`);
compound indexes for the common filter/sort paths; unique `(job, worker)` on offers and
`(booking, from)` on reviews; and a **partial unique index on `Withdrawal.worker` filtered to
`status: requested`**, which is what makes "one open withdrawal at a time" a guarantee rather than
a race.

---

## Tests

```bash
cd backend    && npm test                # 168 tests across 17 files (npm run test:coverage: ~88% lines, 80% floor enforced)
cd ai-service && pytest -q               # 30 tests — semantic matching, trust, pricing, coverage, monotonicity, fallbacks
cd frontend   && npm test && npm run build   # 25 unit/component tests + bundling check
cd flutter_app && flutter analyze && flutter test   # 22 tests

bash scripts/smoke-test.sh <api> <web>   # post-deploy: headers, CORS, auth, /metrics lock-down
k6 run -e API=<staging> loadtest/k6-api.js   # latency budgets as pass/fail thresholds

cd ai-service && python scripts/validate_models.py   # the promotion gate CI enforces
```

| Suite | What it pins down |
| --- | --- |
| `auth`, `profile`, `jobs` | signup, role guards, profile CRUD, discovery filters |
| `negotiation` | turn-taking, atomic accept, competing offers closing |
| `directHire` | private job stays out of browse, outsiders get 403, accept books it |
| `cancellation` | **where the money ends up** in each case — refunded early, refunded by agreement, still held when a request is declined |
| `disputes` | both sides' statements, admin reads the thread but cannot post in it, decision requires a reason |
| `withdrawals` | balances derive from real rows; two concurrent requests cannot withdraw the same money |
| `notifications` | the right person is told, and one account cannot read another's |
| `reviews`, `ai`, `ranking`, `history`, `admin` | ratings, fallbacks, the ranker's gates, seeded-history integrity |
| `ops` | health probes, request ids, security headers, metrics cardinality, session revocation, price cache, production config guard, graceful drain |
| `redis` | limiter works in memory and **fails open** when Redis errors |

### Last full run (all green)

| Suite | Result |
| --- | --- |
| Backend (Vitest + Supertest) | **168 / 168** passed, 17 files; coverage 87.6% lines, 83.6% statements, 82.9% functions, 66.7% branches |
| AI service (pytest) | **30 / 30** passed |
| Web (Vitest) + production build | **38 / 38** passed, build OK |
| Mobile (`flutter analyze` + `flutter test`) | no analyzer issues, **35 / 35** passed; also run on an Android emulator against the live API (sign-in, browse, negotiate, post a job, worker earnings) |
| Live smoke test (API + web) | all checks passed with Redis connected |
| End-to-end feature suite (`scripts/e2e.mjs`, real HTTP + Stripe test cards) | **64 / 64** passed |
| Load test, 50 concurrent users (k6) | 11,591 requests, 0% errors, p95 34 ms, p99 108 ms |
| Stress test, up to 400 users (k6) | peak ~238 req/s on one 1-CPU instance, 0 5xx, CPU-bound; see [PERFORMANCE.md](docs/PERFORMANCE.md) |
| Browser check (headless Chromium, live site) | no CSP violations, console errors or failed requests across the main pages |

Backend tests run against an in-memory MongoDB (`mongodb-memory-server`, downloaded on first run)
with Stripe, Cloudinary and the AI client mocked — no external services, no test keys needed.

The money paths are asserted on the *payment record*, not on the HTTP status: a 200 that leaves
escrow in the wrong state is the failure worth catching.

---

## Deployment notes

Full guide: **[DEPLOYMENT.md](DEPLOYMENT.md)**. In short:

- **Backend** → Render (`render.yaml` blueprint) / Railway / Fly (Dockerfile provided). Set all env vars; the process
  validates them at boot and exits with a readable error if anything is missing.
- **AI service** → any Docker host. 512 MB RAM is enough (measured: 152 MB steady, 351 MB peak).
  Models and the embedding model ship inside the image, so cold starts don't download anything.
- **Database** → MongoDB Atlas free tier. Create the indexes by letting Mongoose sync on first boot.
- **Frontend** → any static host; set `VITE_API_URL` to the deployed backend origin.
- Set `CLIENT_URL` to the deployed frontend origin (comma-separated for multiple) so CORS and
  Socket.io accept it.

### Production operations

- **CI** (`.github/workflows/ci.yml`): backend tests + coverage floor + `npm audit` gate, frontend
  tests/build/audit, AI tests and model gate, Flutter analyze/test/APK build, gitleaks, Docker
  builds with Trivy scans and a container smoke test. Dependabot opens weekly update PRs.
- **Observability**: JSON logs with request ids, Prometheus `/metrics`, Grafana dashboard and
  alert rules in `ops/` (`docker compose -f docker-compose.yml -f docker-compose.observability.yml up`).
- **Scaling**: set `REDIS_URL` to run more than one API instance.
- Docs: [architecture](docs/ARCHITECTURE.md) · [monitoring](docs/MONITORING.md) · [runbook](docs/RUNBOOK.md) · [security](docs/SECURITY.md)

### Known limitations

- Stripe card authorisations expire after ~7 days, so a month-long booking would need Stripe
  Connect with separate charges & transfers in a real deployment.
- Offer acceptance uses atomic conditional updates rather than multi-document transactions
  (the free Atlas tier supports transactions; the in-memory test server does not).
- **Worker payouts stop at the platform account.** Stripe Connect is unavailable for Pakistan, so
  the transfer is made by hand and recorded; the ledger is real, the rail is not automated.
- The web CSP ships report-only until violations are reviewed; the JWT lives in localStorage (see [security](docs/SECURITY.md)).
- ID verification is a human decision — no automated document or liveness checks.
- The ranker ships as hand-set weights. The learning-to-rank loop is built and gated, and will not
  promote a model until there is enough real behaviour to fit one honestly.
