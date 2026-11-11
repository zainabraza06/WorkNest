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

- `.github/workflows/keep-warm.yml` pings `/health` of both services every 10 min and fails
  (GitHub emails you) if the DB or AI models are not serving.
- `scripts/smoke-test.sh <api> <web>` is the deeper post-deploy check (headers, CORS, auth,
  metrics lock-down). Run it after every release.
- Point an external monitor (UptimeRobot / Better Stack) at `/api/health/ready`.
