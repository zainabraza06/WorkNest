// Load test for the WorkNest API, written for k6 (https://k6.io).
//
//   k6 run -e API=http://localhost:5000 loadtest/k6-api.js                 # smoke: 1 VU, 30s
//   k6 run -e API=https://staging.example.com -e PROFILE=load loadtest/k6-api.js
//   k6 run -e API=... -e PROFILE=stress loadtest/k6-api.js                 # find the breaking point
//
// Never point this at production with PROFILE=stress, and never at the free Render tier: the
// first response after idle takes ~50s and would be reported as a failure of the code.
//
// The thresholds below ARE the performance budget. A run that breaches one exits non-zero, so
// the same file works as a CI gate against a staging environment.

import http from 'k6/http';
import { check, group, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const API = __ENV.API || 'http://localhost:5000';
const PROFILE = __ENV.PROFILE || 'smoke';

const PROFILES = {
  // Is it alive and inside budget with a single user?
  smoke: { executor: 'constant-vus', vus: 1, duration: '30s' },
  // Expected peak: ramp to 50 concurrent users and hold
  load: {
    executor: 'ramping-vus',
    stages: [
      { duration: '1m', target: 50 },
      { duration: '3m', target: 50 },
      { duration: '30s', target: 0 },
    ],
  },
  // Beyond expected: keep climbing until something breaks, to learn where and how
  stress: {
    executor: 'ramping-vus',
    stages: [
      { duration: '2m', target: 100 },
      { duration: '3m', target: 200 },
      { duration: '3m', target: 400 },
      { duration: '1m', target: 0 },
    ],
  },
};

export const options = {
  scenarios: { default: PROFILES[PROFILE] },
  thresholds: {
    // Overall budget
    http_req_failed: ['rate<0.01'], // <1% errors
    http_req_duration: ['p(95)<800', 'p(99)<2000'], // ms
    // Per-endpoint budgets: browsing is the hot path and must be the fastest
    'http_req_duration{endpoint:jobs_list}': ['p(95)<500'],
    'http_req_duration{endpoint:workers_search}': ['p(95)<700'],
    'http_req_duration{endpoint:login}': ['p(95)<1200'], // bcrypt is deliberately slow
    'http_req_duration{endpoint:health}': ['p(95)<100'],
    checks: ['rate>0.99'],
  },
};

const rateLimited = new Rate('rate_limited');
const searchLatency = new Trend('search_latency', true);

const CATEGORIES = ['plumbing', 'electrical', 'carpentry', 'painting', 'cleaning', 'ac_repair'];
const CITIES = ['Karachi', 'Lahore', 'Islamabad'];
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export function setup() {
  const res = http.get(`${API}/api/health/ready`);
  if (res.status !== 200) throw new Error(`API not ready at ${API}: ${res.status} ${res.body}`);
}

export default function () {
  group('browse (anonymous)', () => {
    let res = http.get(`${API}/api/jobs?limit=12&category=${pick(CATEGORIES)}`, { tags: { endpoint: 'jobs_list' } });
    check(res, { 'jobs 200': (r) => r.status === 200, 'jobs has items': (r) => r.json('data.items') !== undefined });
    rateLimited.add(res.status === 429);

    res = http.get(`${API}/api/workers?limit=10&category=${pick(CATEGORIES)}&city=${pick(CITIES)}`, { tags: { endpoint: 'workers_search' } });
    check(res, { 'workers 200': (r) => r.status === 200 });
    searchLatency.add(res.timings.duration);
    rateLimited.add(res.status === 429);
  });

  sleep(1 + Math.random() * 2); // think time: real users read before they click

  // Lightweight, unauthenticated, must never be throttled or slow
  const health = http.get(`${API}/api/health/live`, { tags: { endpoint: 'health' } });
  check(health, { 'health 200': (r) => r.status === 200 });

  // A failed login exercises the credential limiter + bcrypt without needing real accounts
  if (__ITER % 10 === 0) {
    const res = http.post(
      `${API}/api/auth/login`,
      JSON.stringify({ email: `loadtest-${__VU}@example.com`, password: 'not-a-real-password' }),
      {
        headers: { 'Content-Type': 'application/json' },
        tags: { endpoint: 'login' },
        // A refused login is the correct outcome here, not a failed request
        responseCallback: http.expectedStatuses(401, 429),
      },
    );
    check(res, { 'bad login is 401 or 429, never 5xx': (r) => r.status === 401 || r.status === 429 });
  }

  sleep(1);
}
