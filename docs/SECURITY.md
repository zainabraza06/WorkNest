# Security

## Controls in place

| Area | Control |
| --- | --- |
| Authentication | bcrypt (cost 12); JWT with `tokenVersion` revocation; password change and *Sign out everywhere* kill all sessions; same checks on REST and Socket.io |
| Brute force | per-IP limiter (20 / 15 min on credentials), per-account limiter (10 failures / 15 min across all IPs), global 500 / 15 min |
| Authorization | role guards + ownership checks in controllers; booking contact/address revealed only after escrow payment |
| Input | Zod schemas on every route; 1 MB JSON cap; upload type and size allow-lists; no raw operators reach Mongo |
| Transport | HSTS; mobile uses HTTPS only; CORS limited to configured origins (verified by smoke test) |
| Headers | API: CSP `default-src 'none'`, nosniff, no-referrer, `no-store`. Web: DENY framing, HSTS, Permissions-Policy, **enforced CSP** (no inline or third-party script; only Stripe, Cloudinary, Google Fonts and the API are allowed) |
| Secrets | env-only; redacted in logs; gitleaks in CI; mobile token in Keychain/Keystore (`flutter_secure_storage`); Stripe **test keys enforced** |
| Supply chain | `npm audit` gate in CI, Dependabot security updates (a GitHub setting, off by default), Trivy image scan, non-root containers, read-only FS in compose |
| Config safety | production boot refuses short `JWT_SECRET`, wildcard CORS, localhost DB; Render-hosted = production-mode even if `NODE_ENV` is forgotten |
| Privacy | ID documents are signed private assets; Sentry runs with `sendDefaultPii: false` |

## Known gaps (deliberate, ranked)

1. ~~CSP is report-only~~ **Done: enforced.** Verified in a real browser: the full Stripe checkout runs with
   zero violations, and an injected inline script, an external script and an exfiltration request are
   all blocked.
2. **Rate-limit store is in memory unless `REDIS_URL` is set.** Set it before running more than one instance.
3. **Web stores the JWT in localStorage**, so an XSS would expose it. The CSP and React's
   escaping reduce the risk; httpOnly refresh cookies are the next step.
4. **No certificate pinning** in the mobile app (reasonable trade-off vs. rotation risk).
5. **Registration reveals whether an email exists** (409). Standard trade-off for UX.
6. Stripe is test-mode only.

## Reporting a vulnerability

Email the repository owner privately; please don't open a public issue. Include steps to
reproduce and the `X-Request-Id` of a failing request if you have one.
