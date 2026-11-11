# Monitoring

Three signals: **metrics** (is it healthy now?), **logs** (what happened to this request?),
**errors** (what broke?). Plus an external uptime check.

## Metrics — `GET /metrics` (Prometheus text)

Closed by default in production. Set `METRICS_TOKEN` (Render can generate one) and scrape with
`Authorization: Bearer <token>`. Grafana Cloud's free tier can scrape it directly.

| Metric | Use |
| --- | --- |
| `http_request_duration_seconds` (labels: method, route pattern, status_class) | p50/p95/p99 per route, error rate |
| `ai_service_calls_total{endpoint,outcome}` | AI fallback rate (`error`/`skipped` vs `ok`/`cache_hit`) |
| `socket_connections` | realtime load |
| default `process_*`, `nodejs_*` | event-loop lag, heap, GC, fds |

Routes are labelled by **pattern** (`/api/jobs/:id`), unmatched URLs collapse to `unmatched`,
so cardinality cannot be blown up by scanners.

### Alert rules (starting points)

```
# 5xx rate above 2% for 5 min
sum(rate(http_request_duration_seconds_count{status_class="5xx"}[5m]))
  / sum(rate(http_request_duration_seconds_count[5m])) > 0.02

# p95 latency above budget for 10 min
histogram_quantile(0.95, sum by (le) (rate(http_request_duration_seconds_bucket[5m]))) > 0.8

# AI path degraded (more than half of calls failing/skipped) for 10 min
sum(rate(ai_service_calls_total{outcome=~"error|skipped"}[10m]))
  / sum(rate(ai_service_calls_total[10m])) > 0.5

# Event loop saturated
nodejs_eventloop_lag_p99_seconds > 0.2
```

## Local Prometheus + Grafana

```bash
printf '%s' "$METRICS_TOKEN" > ops/metrics_token
GRAFANA_PASSWORD=change-me docker compose -f docker-compose.yml -f docker-compose.observability.yml -f docker-compose.local.yml up --build
```

Grafana (localhost:3000) auto-loads the *WorkNest API* dashboard; Prometheus loads the alert
rules in `ops/alerts.yml`; Alertmanager routes are in `ops/alertmanager.yml`. In production use
Grafana Cloud (scrape `/metrics` with the bearer token) and reuse the same rules and dashboard.

## Logs

JSON lines on stdout (pino). Every request logs `req.id`; the same id is returned as
`X-Request-Id` and inside every error body as `requestId`. When a user reports a problem, ask
for the id, then search logs for it. Secrets (Authorization, passwords, account numbers) are
redacted in the logger. Set `LOG_LEVEL=debug` temporarily to diagnose.

## Errors

Set `SENTRY_DSN` on the API to enable Sentry (off otherwise; PII is not sent). The Flutter app
has a single hook, `ErrorReporting.onReport`, and the web `ErrorBoundary` calls
`window.__worknestReportError` — wire either to Sentry without touching feature code.

## Uptime

- `.github/workflows/keep-warm.yml` checks both services and fails (GitHub emails you) if the DB
  or AI models are not serving. **It does not keep Render awake on its own:** GitHub throttles
  scheduled workflows (the `*/10` cron actually fires every several hours, see the run history),
  while Render sleeps a free service after 15 idle minutes. Run it by hand before a demo.
  The reliable mechanism is the in-app keep-alive below.
- `scripts/smoke-test.sh <api> <web>` is the deeper post-deploy check (headers, CORS, auth,
  metrics lock-down). Run it after every release.
- Point an external monitor (UptimeRobot / Better Stack) at `/api/health/ready`.

## Keeping free-tier services awake

Render's free tier sleeps a web service after ~15 minutes without inbound traffic, and the next
request waits 30 to 50 s. Setting `KEEP_ALIVE=true` on the API makes it call its **own public
URL and the AI service** every 10 minutes while it is awake (`backend/src/keepAlive.js`, covered
by `tests/keepAlive.test.js`). That is real inbound traffic, so the idle clock never expires,
with no third-party account.

| Variable | Meaning |
| --- | --- |
| `KEEP_ALIVE` | `true` to enable (default off) |
| `KEEP_ALIVE_INTERVAL_SEC` | ping period, 60 to 840 (default 600; must stay under Render's 15 min) |
| `KEEP_ALIVE_HOURS` | optional daily window, e.g. `8-20`; outside it nothing is pinged so the services sleep |
| `KEEP_ALIVE_TZ` | time zone for the window (default `Asia/Karachi`) |
| `KEEP_ALIVE_URLS` | extra comma-separated URLs to ping (e.g. a status page) |

`RENDER_EXTERNAL_URL` is set by Render automatically; locally nothing is pinged.

**Limits you should know:**
- It cannot wake a service that is already asleep (a sleeping process runs no timers). After a
  deploy or a long outage the first visitor, or an external pinger such as cron-job.org or
  UptimeRobot calling `/api/health/live` every 5 minutes, wakes it, and the keep-alive holds it from there.
- **Free-hours budget.** Render's free tier gives a workspace about 750 instance-hours a month
  (check your Billing page). One service awake 24/7 is 720 h; **two (API plus AI) is ~1,440 h and
  exhausts the budget around day 15**, after which Render suspends them until next month. With
  `KEEP_ALIVE_HOURS=8-20` the pair uses about 735 h. A paid plan (`render.yaml` already targets
  one) removes the sleeping, and the budget, entirely; then leave `KEEP_ALIVE` off.
