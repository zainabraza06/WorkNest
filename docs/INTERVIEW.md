# WorkNest: interview guide

How to present this project, defend its design, and be honest about its limits. Every claim
below is something the repository can show.

## 1. The 60-second pitch

> WorkNest is a labour marketplace for Pakistan: clients post jobs, skilled workers send offers,
> they negotiate in structured rounds, and payment sits in escrow until the work is done.
> There's a React web app and a Flutter mobile app on one Express/MongoDB API, plus a small
> FastAPI service for semantic worker matching, a trust score and fair-price guidance. I treated
> it like a production system: health probes and graceful shutdown, Prometheus/Grafana,
> token revocation, Redis-backed rate limits that fail open, 154 API tests that assert on the
> payment record rather than the HTTP status, and a CI pipeline that gates on audit, container
> scans and secret scanning. It has no real users, so I validated it with load tests and
> deliberate failure injection, and I can tell you exactly where it would break first.

## 2. Five-minute demo script

1. **Landing → Find workers** (live, https://work-nest-z.vercel.app). Type a plain-words query;
   mention semantic matching and that it degrades to keyword search if the AI service is down.
2. **Sign in as the client** (`client1@worknest.test`). Show the login transition, then *Post a
   job* up to the budget step: the **fair-price guide** appears from the AI service.
3. **Offers & chats**: structured negotiation (offer, counter, accept; turn-taking enforced).
4. **Booking → payment**: escrow via Stripe test card; contact and address stay hidden until paid.
5. **Admin console**: ID verification, disputes (a case with both sides' statements), payouts.
6. **Grafana dashboard**: request rate, p95 latency, error rate, AI fallback rate.
7. **Mobile app** on the emulator: same flows, same API.

Warm the free-tier services first (open the site two minutes before): cold starts take ~50 s.

## 3. Architecture in one breath

```
React (Vercel) ─┐                       ┌─ FastAPI AI service (stateless, models baked in)
Flutter app ────┼─ HTTPS/WSS ─ Express API (Render) ─┼─ MongoDB Atlas
                │              Socket.io + Redis     ├─ Redis (Upstash): rate limits + socket adapter
                │                                    ├─ Stripe (escrow, webhook)
                │                                    └─ Cloudinary (images, signed ID docs)
                └─ Prometheus scrapes /metrics ─ Grafana ─ Alertmanager
```

A **modular monolith** plus one separate service, on purpose. See `docs/ARCHITECTURE.md`.

## 4. Design decisions and the trade-off behind each

| Decision | Why | What it costs / when I'd change it |
| --- | --- | --- |
| Modular monolith, not microservices | One team, one deploy, transactions stay simple | Scaling is whole-API; split a module only when its load or release cadence diverges |
| AI as a separate service | Different runtime (Python/ML), different failure profile | Network hop; mitigated with a 4 s timeout, a circuit breaker and a fallback |
| Escrow via Stripe **manual capture** | Authorise now, capture on completion: no custom ledger | Card authorisations expire (~7 days), a real limit for long jobs |
| Worker payouts settled outside Stripe | Stripe Connect needs KYC and is not available for Pakistan payouts | Manual admin step; documented as a deliberate gap |
| JWT with `tokenVersion` | Revoke every session with one integer bump, no blacklist to sync | Per-user, not per-token; no single-session revoke |
| Redis for rate limits and Socket.io, **fail open** | A Redis outage must not take login down | A limiter outage briefly weakens brute-force protection |
| Balances **derived** from rows, not counters | No drift; two concurrent withdrawals cannot spend the same money | Slightly heavier reads; cache if it shows up in profiling |
| Idempotent webhook plus `payment/sync` poll | Stripe retries and delivery can be late | Two code paths to keep consistent |
| No Kafka, no queue yet | Event volume is a few per second (see §7) | Add BullMQ on the existing Redis when write p95 exceeds budget |
| Vitest, not Jest | Native ESM, faster, same API | Smaller ecosystem for exotic plugins |
| CSP in report-only first | Enforcing blind breaks Stripe's iframes | Enforce after reviewing reports (Stripe page still to verify) |

## 5. Failure modes (what the user sees)

| Failure | Behaviour |
| --- | --- |
| AI service down or cold | Keyword search, placeholder trust score, price hint hidden; breaker opens 30 s |
| MongoDB unreachable | `/ready` returns 503 and the instance leaves rotation; `/live` stays 200 (no restart storm) |
| Redis down | Limiters and sockets fail open; no data lost |
| Deploy / SIGTERM | Readiness fails first, in-flight requests finish, sockets and pool close |
| Stripe webhook retried or late | Handler is idempotent; `payment/sync` is the backstop |
| Token stolen | Password change or *Sign out everywhere* bumps `tokenVersion` |

## 6. Questions you will be asked, with answers

### Architecture and scaling
- **Why a monolith?** Domain is small and transactional (offer → booking → payment). Splitting
  buys network failure modes and distributed transactions with no scaling benefit yet.
- **How do you scale it 100×?** (1) Leave the free tier (cold starts are the biggest latency).
  (2) Atlas tier plus indexes from the Performance Advisor. (3) Horizontal API instances: JWT
  is stateless, uploads go straight to Cloudinary, Redis already shares rate limits and
  sockets. (4) Queue (BullMQ) for ranking and notification work. (5) Read replicas after profiling.
- **What's the first thing to break?** The AI service on the free tier, then the Mongo pool.
  Say which metric tells you (`ai_service_calls_total{outcome}`, pool wait time, p95).
- **Why not Kafka?** Load is a few events per second. Kafka is for thousands per second or
  several independent consumers replaying one stream. Redis plus BullMQ is the right next step.

### Data and consistency
- **Two withdrawals at once?** Atomic conditional updates on the balance rows; tested with
  concurrent requests in `withdrawals.test.js`.
- **Webhook arrives twice or late?** The handler derives escrow state from the PaymentIntent
  status instead of incrementing anything, so repeats are no-ops.
- **Why can a worker not see the address before payment?** Contact details are revealed only
  once escrow is funded; it protects both sides and is enforced server-side in the controller.
- **Indexes?** 2dsphere for distance search, a text index for keywords, compound indexes for
  the discovery filters.

### Security
- **JWT in localStorage on the web: XSS?** Yes, a known gap (docs/SECURITY.md). Mitigations:
  strict CSP rollout, React escaping, short-lived tokens, `tokenVersion` revocation. Next step is
  httpOnly refresh cookies. The mobile app stores the token in Keychain/Keystore.
- **Brute force?** Per-IP limiter, per-account limiter (counts failures across IPs), global cap.
- **Why fail-open for the limiter?** Availability over a degraded control for a short outage;
  the per-account lockout is also in Redis, so this is a conscious trade-off. For a bank you
  would fail closed.
- **Secrets?** Env-only, redacted in logs, gitleaks in CI, Stripe test keys enforced in code.
- **Supply chain?** `npm audit` gate, Dependabot, Trivy image scan, non-root containers.

### Operations and testing
- **How do you know it's healthy?** `/live`, `/ready`, Prometheus metrics, alerts, request ids
  traceable from a user report to a log line.
- **Deploy safety and rollback?** Readiness-gated deploys on Render, CI gates, redeploy a
  previous commit. Honest gap: no staging or canary yet.
- **Testing strategy?** 154 backend tests against an in-memory MongoDB with Stripe, Cloudinary
  and the AI client mocked; money paths assert the *payment record*. Web: component tests.
  Mobile: widget tests. AI: model-quality gates in CI. Plus a live smoke test, an end-to-end
  feature script (`scripts/e2e.mjs`) and a k6 load profile.
- **Hardest bug?** Pick a real one: `/metrics` was publicly readable in production because
  `NODE_ENV` was unset on Render. Smoke test caught it; fix was `isProd` also true on
  `RENDER=true`, plus a startup warning. Or: the admin queue rendering `[object Object]`,
  found while taking screenshots.

### AI
- **How does matching work?** Sentence embeddings (fastembed) over the job text and worker
  profiles, blended with distance, rating, availability and trust; gates stop bad matches
  ranking high. **Be honest:** the models are trained on synthetic and seeded data; there is no
  claim about real-world accuracy.
- **What if the AI is wrong or down?** Fallbacks everywhere; the user can still set any price.
- **How would you evaluate it for real?** Log ranking events (impressions, clicks, hires),
  hold out a test set, measure hire rate at top-k and compare against the keyword baseline.

## 7. Numbers (fill from your own runs, do not invent)

| Metric | Value | Source |
| --- | --- | --- |
| Backend tests | 154 passing, ~88% line coverage | `npm run test:coverage` |
| AI tests / web tests / mobile tests | 30 / 25 / 18 | pytest / vitest / flutter test |
| Event volume estimate | a few events per second at 10k daily users | capacity maths, not measured |
| Load test p95 / error rate / saturation point | _fill from `loadtest/k6-api.js` run_ | k6 |
| End-to-end feature checks | _fill from `scripts/e2e.mjs`_ | e2e |

Capacity reasoning you can say out loud: 10,000 daily users with ~30 requests each is ~300k
requests a day, about 3.5 req/s average and ~15 req/s at peak, against a single instance that
holds well above that. State it as an estimate.

## 8. Weak spots, and how to own them

| They find | You say |
| --- | --- |
| "No real users" | "Right. I load-tested with k6, injected failures, and I know the saturation point and its bottleneck." |
| "AI is trained on fake data" | "Yes, so I built fallbacks and a gate, and the evaluation plan is in this document. I make no accuracy claim." |
| "Free tier, cold starts" | "Known; the blueprint targets a paid plan in Singapore. Cold start is the largest latency today." |
| "JWT in localStorage" | "Documented gap; httpOnly refresh cookies are next." |
| "Stripe test mode only" | "By design, enforced in code; going live needs KYC, legal terms for escrow and a payout rail." |
| "No staging" | "Yes: staging plus the k6 profile as a release gate is the top roadmap item." |

## 9. CV bullets (pick two or three, keep them true)

- Built and deployed a full-stack labour marketplace (React, Flutter, Node/Express, FastAPI,
  MongoDB, Redis) with structured negotiation, Stripe-test escrow, disputes and manual payouts.
- Designed for failure: health/readiness probes, graceful shutdown, circuit-broken AI calls
  with fallbacks, Redis-backed rate limits that fail open, JWT revocation via token versioning.
- Instrumented with pino request-id logging, Prometheus metrics, Grafana dashboards and
  alert rules; added a CI pipeline with audit, container-scan and secret-scan gates.
- Wrote 154 API tests (~88% line coverage) that verify escrow state on the payment record,
  plus a live smoke test, an end-to-end feature suite and k6 latency budgets.

**Do not write:** "scalable", "enterprise-grade", "AI-driven", user counts you do not have,
or "production" without "load-tested, no real traffic".

## 10. Roadmap you can speak to (ranked by risk reduction)

1. Staging environment with the k6 profile as a release gate
2. httpOnly refresh-cookie auth on web; enforce the CSP after the report-only period
3. Atlas backup restore drill and PITR
4. BullMQ on the existing Redis if write p95 exceeds budget
5. FCM push for mobile; Sentry on web and mobile
6. A real evaluation harness for the matching model
