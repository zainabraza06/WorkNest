# Security

## Controls in place

| Area | Control |
| --- | --- |
| Authentication | bcrypt (cost 12, constant-time for unknown emails); JWT pinned to HS256 with `tokenVersion` revocation; password change and *Sign out everywhere* kill all sessions; same checks on REST and Socket.io |
| Brute force | per-IP limiter (20 / 15 min on credentials), per-account limiter (10 failures / 15 min across all IPs), global 500 / 15 min |
| Authorization | role guards + ownership checks in controllers; booking contact/address revealed only after escrow payment |
| Input | Zod schemas on every route; 1 MB JSON cap; upload type and size allow-lists; no raw operators reach Mongo |
| Transport | HSTS; mobile uses HTTPS only; CORS limited to configured origins (verified by smoke test) |
| Headers | API: CSP `default-src 'none'`, nosniff, no-referrer, `no-store`. Web: DENY framing, HSTS, Permissions-Policy, **enforced CSP** (no inline or third-party script; only Stripe, Cloudinary, Google Fonts and the API are allowed) |
| Secrets | env-only; redacted in logs; gitleaks in CI; mobile token in Keychain/Keystore (`flutter_secure_storage`); Stripe **test keys enforced** |
| Supply chain | `npm audit` gate in CI, `pip-audit` clean, Dependabot security updates and GitHub secret scanning with push protection (enabled), Trivy image scan, non-root containers, read-only FS in compose |
| Config safety | production boot refuses short `JWT_SECRET`, wildcard CORS, localhost DB; Render-hosted = production-mode even if `NODE_ENV` is forgotten |
| Privacy | ID documents are signed private assets; Sentry runs with `sendDefaultPii: false` |

## Known gaps (deliberate, ranked)

1. ~~CSP is report-only~~ **Done: enforced.** Verified in a real browser: the full Stripe checkout runs with
   zero violations, and an injected inline script, an external script and an exfiltration request are
   all blocked.
2. **Rate-limit store is in memory unless `REDIS_URL` is set.** Set it before running more than one instance.
3. **Web stores the JWT in localStorage**, so an XSS would expose it. The enforced CSP and React's
   escaping make injection hard, but the structural fix (an httpOnly cookie) needs the web app and API
   on one domain; see the review below.
7. **The AI service has no key set in production yet** (finding 2 below). Set it before real traffic.
4. **No certificate pinning** in the mobile app (reasonable trade-off vs. rotation risk).
5. **Registration reveals whether an email exists** (409). Standard trade-off for UX.
6. Stripe is test-mode only.

## Internal security review

A code-level review of the API, realtime layer, uploads, payments and the AI service, followed by
live checks. **It was done by the developer's own tooling, not an independent party**, so it
reduces risk but is not a substitute for a penetration test.

| # | Severity | Finding | Status |
| --- | --- | --- | --- |
| 1 | Medium | Login timing revealed which emails are registered: an unknown email skipped the ~100 ms bcrypt compare and answered far faster, however identical the error text | **Fixed**: a dummy hash is compared for unknown emails |
| 2 | Medium | The live AI service answered requests with **no service key** (HTTP 200), so anyone could make it do work | **Open until configured**: set `SERVICE_API_KEY` on the AI service and `AI_SERVICE_KEY` on the API to the same random value. Code now compares in constant time and logs a production warning when the key is missing |
| 3 | Low-Medium | `PATCH /auth/password` was not rate limited, so a stolen session could guess the current password | **Fixed**: per-IP credential limiter |
| 4 | Low | JWT algorithm was not pinned on sign or verify | **Fixed**: `HS256` only; tests reject `HS512` and `alg: none` tokens |
| 5 | Low | Uploads trusted the client's `Content-Type`; public uploads used Cloudinary `resource_type: auto` | **Fixed**: magic-byte check (JPEG, PNG, WebP, PDF) and images-only for public uploads |
| 6 | Low | Revoking sessions (*sign out everywhere*, password change) left live Socket.io connections open | **Fixed**: the user's sockets are disconnected on every instance |
| 7 | Info | Web login token lives in `localStorage` for up to 7 days | **Mitigated, not removed**, see below |
| 8 | Info | Python dependencies had no automated vulnerability check | **Checked**: `pip-audit` reports none |

**Checked and found sound:** Stripe webhook signature verification on the raw body; Socket.io room
joins require being a participant; request bodies go through validated schemas, so roles cannot be
mass-assigned and admin cannot be self-registered; search input is regex-escaped; production hides
internal error detail; CORS is an allow-list; private ID documents are served by short-lived signed
URLs; uploads have size and count limits.

**Authorization matrix** (`scripts/e2e.mjs`): another client, another worker and a brand-new account
each attempt 17 sensitive actions on someone else's booking, offer and job (read, pay, start,
complete, cancel, dispute, review, message, counter, accept, reject, withdraw, edit). All 51 are
refused and the booking is unchanged. Anonymous callers are refused on every protected route and the
wrong role is refused on role-restricted ones.

### Why the web token is still in `localStorage`
Moving it to an httpOnly cookie is the right end state, but the web app (`vercel.app`) and the API
(`onrender.com`) are different registrable domains, so the cookie would be a third-party cookie.
Safari and Brave block those by default, which would break sign-in for those users. Proxying `/api`
through Vercel makes the cookie first-party but collapses every visitor's IP into Vercel's egress
addresses at the API (or forces a client-IP trust setting that direct callers could spoof), which
weakens rate limiting. The robust fix is hosting both under one domain you control
(`app.example.com` and `api.example.com`) with a `SameSite=Lax` cookie. Until then the risk is
contained by the enforced CSP above (an injected script cannot run or send data out) and by the
7-day expiry with server-side revocation.

## Reporting a vulnerability

Email the repository owner privately; please don't open a public issue. Include steps to
reproduce and the `X-Request-Id` of a failing request if you have one.
