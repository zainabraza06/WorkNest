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

## From demo data to real data

What is synthetic today, and what happens once real people use the product.

| Data | Today | When real traffic arrives |
| --- | --- | --- |
| Accounts, jobs, bookings, reviews, payouts in the live database | **Synthetic.** Created by `npm run seed` (`src/scripts/seed.js`, `history.js`); the demo logins (`client1@worknest.test` and friends, password `Password123`) are public in the README | Real users and records are stored next to them. They are not separated automatically |
| Fair-price model | **Synthetic.** Trained on generated rows around hand-assembled wage anchors (`ai-service/data/rate_anchors.json`), not a wage survey | **Not automatic.** It keeps predicting from those anchors until you replace them and retrain (`ai-service/scripts/train_price_model.py`). There is no export script for real bookings yet |
| Trust-score model | **Synthetic.** Trained on a hand-designed formula plus noise | The score is computed from each worker's **real** stats at request time, but the model's weights still come from that formula until it is retrained on real outcomes. No export script for this yet either |
| Semantic matching | Pre-trained text embeddings (fastembed); no WorkNest-specific training | Unchanged |
| Search ranking (learning to rank) | Falls back to the heuristic ordering | **Real data.** Every search is already logged as a `SearchImpression` with the clicks and hires that follow. `npm run export:ranking` then `python scripts/train_ranker.py` fits a ranker, and refuses to ship one below a minimum volume or if the learned weights look confounded |

So the answer to "will we use real data once it comes?" is **yes for ranking, and only after
deliberate retraining for price and trust**. Nothing retrains itself.

### Before going live with real users

1. **Remove the demo data and demo logins.** `npm run seed` wipes every collection, so it is the
   wrong tool in production (it refuses when `NODE_ENV=production`, but a script run from a laptop
   against the production URI does not know that). Start from a fresh Atlas database, or delete the
   seeded users and everything that references them, and create a real admin account.
2. **Keep the seed for development only.** Point `MONGODB_URI` at a separate database for demos.
3. **Collect real outcomes first, retrain later.** Let a few hundred real searches and bookings
   accumulate, then run the ranker pipeline above. For price and trust, add an export from real
   bookings to the training scripts and retrain; the feature contract is already the same.
4. **Re-run the checks that gate a model**: `python scripts/validate_models.py` (also enforced in CI).
5. **Say so in the product.** The fair-price guide is guidance from a model trained on assumptions;
   until it is retrained on real bookings it should not be presented as market data.
