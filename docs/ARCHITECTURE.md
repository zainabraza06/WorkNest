# Production architecture

What runs where, what fails how, and what to change first as traffic grows.

## Topology

```
 Flutter app ─┐                         ┌──────────────┐
 (Android/iOS)│  HTTPS + WSS            │  ai-service  │  stateless, models baked into the image
              ├──► Render: worknest-api ─┤  (FastAPI)   │  breaker + 4s timeout on the caller side
 React web ───┘    Express + Socket.io  └──────────────┘
 (Vercel CDN)          │   │   │
                       │   │   └──► Stripe (escrow, webhook → raw-body route)
                       │   └──────► Cloudinary (images, signed ID documents)
                       ▼
                 MongoDB Atlas (replica set)
```

Both clients speak the same REST API (`/api`). The web app also uses Socket.io for live
threads; the mobile app polls every 8 s while a thread is open (push notifications are the
next step, see Roadmap).

## Failure modes (what the user sees)

| Failure | Behaviour | Why it is safe |
| --- | --- | --- |
| AI service down / cold | Keyword search, placeholder trust score, price hint hidden | Circuit breaker opens 30 s; `ai_service_calls_total{outcome}` shows it |
| MongoDB unreachable | `/api/health/ready` → 503, instance leaves rotation; `/live` stays 200 | No restart storm from a dependency blip |
| Deploy / SIGTERM | Readiness fails first, in-flight requests finish, sockets and pool close | `SHUTDOWN_TIMEOUT_MS` caps the drain |
| Stripe webhook retried | Handler is idempotent per intent status | Escrow state is derived, never incremented |
| Token stolen | Password change or *Sign out everywhere* bumps `tokenVersion`, revoking every JWT | No blacklist to store or sync |
| Client sends junk | Zod validation at the edge; 1 MB body cap; per-IP, per-account and global limiters | Rejected before touching Mongo |

## Request path and latency budget

Budgets are enforced by `loadtest/k6-api.js` thresholds: public list p95 < 500 ms, worker
search p95 < 700 ms, health p95 < 100 ms, errors < 1 %.

Levers already in place: gzip, bounded Mongo pool (`DB_MAX_POOL_SIZE`), `socketTimeoutMS`,
compound/2dsphere/text indexes, a 10-minute in-process cache for AI price guidance, a
single-hop aggregation for search, `Cache-Control: no-store` only on the API (static assets on
the CDN are immutable and cached for a year).

## Scaling plan (in the order you will need it)

1. **Leave the free tier.** Cold starts (~50 s) are the largest latency in the system today.
   `render.yaml` targets a paid plan in Singapore (closest region to Pakistan).
2. **Atlas tier + indexes.** Watch slow queries in Atlas Performance Advisor; add indexes it
   suggests. Move reads to secondaries only after profiling.
3. **Horizontal API scale.** Needs two things first: a shared rate-limit store (Redis; the
   in-memory one is per-instance) and the Socket.io Redis adapter, so rooms span instances.
   Everything else is already stateless (JWT, no server sessions, uploads go straight to
   Cloudinary).
4. **Async work.** Ranking/trust refresh and notifications run inline; move to a queue
   (BullMQ) when p95 on write endpoints exceeds budget.
5. **Mobile push.** FCM replaces polling; the `notifications` collection is already the source.

## Environments

| | Local | Staging (recommended) | Production |
| --- | --- | --- | --- |
| API | `docker compose up` | Render blueprint, separate Atlas DB | Render blueprint |
| Stripe | test | test | **test only by design** (`sk_test_` enforced in `env.js`) |
| Mobile | `--dart-define=API_URL=http://10.0.2.2:5000` | staging URL | `--dart-define=API_URL=https://…` |

Going live with real money requires lifting the test-key guard deliberately, a Stripe
account review, and legal terms for escrow — it is intentionally not a config flip.

## Roadmap (not done, ranked by risk reduction)

- Redis for rate limits + Socket.io adapter (prerequisite for >1 API instance)
- Atlas backup restore drill (see RUNBOOK) and PITR
- FCM push for mobile; Sentry DSN on web and mobile (hooks exist)
- Enforce the CSP after a report-only period
- Staging environment with the k6 `load` profile as a release gate
