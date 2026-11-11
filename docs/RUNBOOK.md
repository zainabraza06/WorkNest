# Runbook

## Deploy

Push to `main` → CI (tests, audit, secret scan, image scan, Flutter analyze/build) → Render and
Vercel auto-deploy. Then: `scripts/smoke-test.sh https://<api> https://<web>`.
Confirm `version` in `/api/health` equals the commit you shipped.

## Roll back

- **API / AI:** Render dashboard → Deploys → *Rollback* to the last good deploy (seconds), then
  `git revert` on main so the next push doesn't redeploy the bad commit.
- **Web:** Vercel → Deployments → *Promote to production* on the previous one.
- **Models:** they are committed; `git revert` the model commit. Checksums in
  `ai-service/models/manifest.json` refuse a mismatched artifact.
- **Mobile:** releases are versioned binaries; ship a fixed build. Keep the API backward
  compatible for at least two app versions.

## Incidents

| Symptom | First check | Likely cause / action |
| --- | --- | --- |
| Everything 5xx | `/api/health/ready` | `db: disconnected` → Atlas status, IP allowlist, credentials rotated |
| Slow search, "keyword" mode | `ai_service_calls_total`, AI `/health` | AI cold or down; wake it, check `AI_SERVICE_URL`/`AI_SERVICE_KEY` match |
| Users suddenly signed out | recent password changes / *sign out everywhere* | expected: `tokenVersion` bump. If widespread, was `JWT_SECRET` changed? |
| 429s for real users | `RateLimit` headers, logs | shared NAT/office IP; raise `limit` in `app.js`; check `TRUST_PROXY_HOPS` |
| Every request shows the same client IP | `TRUST_PROXY_HOPS` | too low → limiter hits the proxy. Render = 1 |
| Payment stuck in `pending_payment` | Stripe dashboard → webhook deliveries | webhook secret wrong or endpoint failing; user can *refresh status* (calls `/payment/sync`) |
| Boot loop after deploy | Render logs | `Invalid environment configuration` lists exactly which variable |

## Secrets rotation

1. `JWT_SECRET`: rotating signs everybody out (acceptable; do it after any suspected leak).
2. Cloudinary / Stripe / Atlas: rotate in the provider, update Render env, redeploy, smoke-test.
3. `AI_SERVICE_KEY` must change on both services together.
4. Anything that ever appeared in git history is compromised: rotate, don't just delete.

## Backups and restore

MongoDB Atlas holds all state (Cloudinary holds media, Stripe holds money). On a paid Atlas tier
enable **Continuous Cloud Backup (PITR)**. A backup that has never been restored is a hope, not
a backup: once a quarter restore the latest snapshot into a scratch cluster, point a local API
at it (`MONGODB_URI`), and run `npm run seed`-free smoke checks. Record the time it took — that
is your real RTO.

## Render configuration checklist (production)

- `NODE_ENV=production`, `TRUST_PROXY_HOPS=1`, `CLIENT_URL` = exact web origin(s)
- `JWT_SECRET` ≥ 32 chars, `METRICS_TOKEN` set, `SENTRY_DSN` set
- Health check path `/api/health/ready`
- Paid plan, region Singapore, auto-deploy on `main`
- Atlas: IP allowlist limited to Render egress IPs, a least-privilege DB user, backups on
