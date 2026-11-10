import client from 'prom-client';

/**
 * Prometheus metrics. Scraped from GET /metrics (see routes/index.js for access control).
 *
 * The histogram is the latency source of truth: p50/p95/p99 per route come from it, and the
 * alert rules in docs/MONITORING.md are written against these names. Labels use the matched
 * route *pattern* (`/api/jobs/:id`), never the raw URL — raw ids would create one time series
 * per document and take the metrics store down.
 */
export const registry = new client.Registry();
registry.setDefaultLabels({ service: 'worknest-api' });
client.collectDefaultMetrics({ register: registry });

export const httpDuration = new client.Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request latency in seconds',
  labelNames: ['method', 'route', 'status_class'],
  buckets: [0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const aiCalls = new client.Counter({
  name: 'ai_service_calls_total',
  help: 'Calls to the AI service by outcome (ok, error, skipped when the circuit is open, cache_hit)',
  labelNames: ['endpoint', 'outcome'],
  registers: [registry],
});

export const socketConnections = new client.Gauge({
  name: 'socket_connections',
  help: 'Currently connected realtime clients',
  registers: [registry],
});

const SKIP = new Set(['/api/health', '/api/health/live', '/api/health/ready', '/metrics']);

/** Express middleware: times every request and records it against its route pattern. */
export function metricsMiddleware(req, res, next) {
  const end = httpDuration.startTimer();
  res.on('finish', () => {
    if (SKIP.has(req.path)) return;
    // req.route is only set when a handler matched; unmatched paths collapse to one label so a
    // scanner hammering random URLs cannot create unbounded series.
    const route = req.route ? `${req.baseUrl}${req.route.path}` : 'unmatched';
    end({ method: req.method, route, status_class: `${Math.floor(res.statusCode / 100)}xx` });
  });
  next();
}
