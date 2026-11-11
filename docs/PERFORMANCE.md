# Performance and scale testing

Measured, not estimated. Every number here came from a run you can repeat.

## Setup (what was actually tested)

| | |
| --- | --- |
| API | one container, **1 CPU, 512 MB** (`docker-compose.yml` limits), production mode |
| Dependencies | AI service, Redis, and **MongoDB 7 in a local container** (not Atlas) |
| Load generator | k6 in a container on the same Docker network (`loadtest/k6-api.js`) |
| Clients | each virtual user presents its own IP via `X-Forwarded-For` (`-e CLIENT_IPS=1`), so the per-IP limiter does not throttle a single generator; real traffic comes from many IPs |
| Traffic mix | anonymous browse (jobs list, worker search with filters), health, and 1 in 10 iterations a failing login (exercises the credential limiter); 1 to 3 s think time |
| Host | a developer laptop running Docker Desktop, the load generator, the stack **and** an Android emulator at the same time |

Read the numbers as *indicative*: a shared laptop is slower than a dedicated Render instance in
some respects (CPU contention) and faster in others (a MongoDB on the same host, no network
hop). Against Atlas, expect higher p95 on database-bound routes.

Reproduce (everything in Docker, with a throwaway local MongoDB):

```bash
export METRICS_TOKEN=$(openssl rand -hex 24); printf '%s' "$METRICS_TOKEN" > ops/metrics_token
GRAFANA_PASSWORD=change-me docker compose   -f docker-compose.yml -f docker-compose.observability.yml -f docker-compose.local.yml up -d --build
(cd backend && MONGODB_URI=mongodb://127.0.0.1:27017/worknest npm run seed)
docker run --rm --network worknest_default -v "$PWD/loadtest:/scripts" grafana/k6 run   -e API=http://backend:5000 -e CLIENT_IPS=1 -e PROFILE=load /scripts/k6-api.js     # smoke | load | stress
```

`docker-compose.local.yml` adds the MongoDB and points the API at it, so nothing touches Atlas.
Web is on :8080, API :5000, AI :8000, Grafana :3000, Prometheus :9090, Alertmanager :9093.

(`CLIENT_IPS=1` only works with `TRUST_PROXY_HOPS=1`, which is how Render runs the API.)

## Results

| Profile | Load | Requests | Errors | p95 | p99 | Budget |
| --- | --- | --- | --- | --- | --- | --- |
| **smoke** | 1 user, 30 s | 32 | 0% | 52 ms | n/a (max 97 ms) | met |
| **load** | ramp to **50 concurrent users**, hold 3 min | 11,591 | **0%** | **34 ms** | **108 ms** | all met (p95 < 800 ms, p99 < 2 s) |
| **stress** | ramp to **400 concurrent users** over 9 min | 81,894 | 0.12% (all `429` from the login limiter, **zero 5xx**) | 1.13 s | 1.89 s | breached above ~200 req/s, as intended |

Per-endpoint p95 in the **load** run: jobs list 38 ms (budget 500), worker search 43 ms (budget
700), failed login 44 ms (budget 1,200), health 11 ms (budget 100).

### Where it saturates (stress run)

- **Peak throughput: about 238 req/s** (one-minute rate, Prometheus), with 400 users and 1 to 3 s think time.
- **The bottleneck is CPU.** Container CPU climbed in step with load and sat at **93 to 96% of its 1-CPU limit** at peak. Memory stayed flat at about 100 MB of 512 MB (no leak, no pressure).
- **Event-loop lag** (p99) rose from under 20 ms to about **470 ms** at saturation: the Node event loop is the queue.
- **It degrades, it does not fall over.** Latency rose smoothly; there were no 5xx, no restarts and no dropped requests. Excess work waits rather than failing.
- **Budgets held up to roughly 120 to 150 req/s** (p95 stayed under about 300 ms), then slid toward 1 to 2 s above ~200 req/s.
- The only failed requests were the 101 `429` responses from the credential limiter on the deliberate bad-login traffic: that is the limiter working, not a fault.

Evidence: `docs/screenshots/13-grafana-dashboard.png` (request rate, latency percentiles, per-route
p95, event-loop lag and memory across the run) and `docs/screenshots/14-prometheus-alerts.png`.

### What the numbers mean for capacity

A product with 10,000 daily active users issuing ~30 requests each produces ~300,000
requests/day: about **3.5 req/s average and ~15 req/s at peak**. One 1-CPU instance held its
latency budget to ~120 to 150 req/s, so that is roughly **8 to 10 times peak headroom** on one
instance, before any horizontal scaling.

### What to do when the headroom runs out (in order)

1. **Add instances.** The API is stateless (JWT, no server sessions, uploads go to Cloudinary) and
   Redis already shares rate-limit counters and Socket.io rooms, so scaling out is a setting.
2. **Cache the hot read path.** The jobs list and worker search are repeated, public reads:
   a short TTL cache (Redis) in front of them would take most of the CPU off the API.
3. **Profile before tuning.** At saturation the work is JSON serialisation, Mongoose hydration and
   validation. `.lean()` on list queries and trimming response fields are the first cheap wins.
4. **Then the database.** Atlas tier, the Performance Advisor, and read replicas after profiling.

## Functional end-to-end suite

`scripts/e2e.mjs` drives the real API over HTTP (and a real Socket.io connection) against a
seeded local stack, including **real Stripe test-mode payments** (a test card confirms the
escrow PaymentIntent; the hold is captured, released or refunded by the app).

**64 of 64 checks pass.** Coverage by area:

| Area | Checks |
| --- | --- |
| Health & observability | liveness, readiness, version, security headers, request ids, JSON 404 with `requestId`, `/metrics` closed to anonymous and served with the token |
| Authentication & sessions | bad password, validation, register (worker and client), duplicate email (409), role guards, *sign out everywhere* revokes every token, password change revokes old tokens |
| Profiles | client and worker profile, user update, worker profile creation |
| Discovery & AI | worker search, plain-words semantic search, filters, public profile, fair-price guidance, ranking events |
| Jobs | create, list, detail, my jobs, edit, ownership check, validation, cancel |
| Negotiation | offer, duplicate refused, counter with turn-taking enforced, chat both ways with read receipts, outsiders blocked, withdraw, Socket.io accepts good tokens and rejects bad ones |
| Booking & payment | accept creates booking, contact details hidden until paid, **Stripe test-card escrow (held, not captured)**, start, complete (release), two-way reviews |
| Cancellation & disputes | cancel before payment, refund after early cancel, mutual cancellation once started, dispute with admin resolution (reason required, only admin can resolve) |
| Payouts | earnings, payout method validation, minimum withdrawal, request, admin queue, settlement |
| Notifications | list, mark read, no cross-user leakage |
| Admin | overview, ID verification queue, dispute queue |
| Abuse protection | repeated bad logins are throttled (429) |

```bash
docker exec worknest-redis-1 redis-cli FLUSHALL        # reset limiter state between runs
STRIPE_SECRET_KEY=sk_test_... METRICS_TOKEN=... node scripts/e2e.mjs http://localhost:5000
```

## Findings from this round

- **Fixed:** `docker-compose.observability.yml` crash-looped Redis (`setpriv: Operation not
  permitted`): the image's entrypoint drops root privileges itself, which `cap_drop: ALL`
  forbids. The service now starts as the unprivileged `redis` user.
- **Fixed:** the hardened `docker-compose.yml` never served the web app. The nginx container
  runs as uid 101 but its tmpfs for the rendered config was root-owned, so the entrypoint logged
  `/etc/nginx/conf.d is not writable`, rendered no config, and nginx listened on nothing (the
  container stayed `unhealthy`). The tmpfs mounts now set `uid=101,gid=101`. CI had not caught it
  because its container smoke test does not use the read-only filesystem.
- **Fixed:** the admin ID-verification row rendered `[object Object]` instead of the worker's category.
- **Known limit:** the failed-login probe exceeds the 20-per-15-minutes credential limit per
  user over a long run, so a few `429`s are expected and tolerated by the test.
- **Fixed (found by running the mobile app on an emulator):**
  - the worker profile's category and skill chips rendered as empty pills (the chip theme set no label colour);
  - the auth screens left a black band under the white sheet on tall phones;
  - status-bar icons were dark on the near-black auth header;
  - "1 offers" (no singular), now `countOf(1, 'offer')` with a test;
  - skills that merely repeat a category label are hidden, as on the web;
  - the API request timeout was 35 s, shorter than a Render free-tier cold start (measured 33 s from a warm laptop, ~50 s documented), so the first sign-in of the day could fail with "Unable to reach the server". It is now 60 s.
