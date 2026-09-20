# Deploying WorkNest

Three containers. MongoDB is Atlas (managed), not a container — the app relies on geospatial and
text indexes, and running against Atlas locally keeps dev and prod honest.

```bash
docker compose up --build
# web  http://localhost:8080
# api  http://localhost:5000
# ai   http://localhost:8000/docs
```

Requires `backend/.env` (see `backend/.env.example`). Compose reads it directly and overrides
`AI_SERVICE_URL` to the container DNS name.

---

## How the models are handled

The part worth understanding, because it is the piece most projects get wrong.

**Models are artifacts, not source — but small ones ship with the code.**

| Artifact | Size | Where it lives | Why |
| --- | --- | --- | --- |
| `price_model.pkl` | 0.51 MB | committed | Small, deterministic, rollback = `git revert` |
| `trust_model.pkl` | 0.41 MB | committed | Same |
| `ranker.pkl` | ~1 KB | **gitignored** | Fitted on real user behaviour, not reproducible from the repo |
| embedding model | 67 MB | **baked into the Docker image** | Too big for git; a runtime download makes cold starts slow and offline hosts degrade silently |

**Nothing is trained at deploy time.** A deploy starts a server. Training happens deliberately,
locally or in CI, and the resulting artifact is validated before it ships. Training during a
deploy means a slow or failed training run takes production down, and two deploys of the same
commit can produce different models.

### Pinning and integrity

`ai-service/models/manifest.json` is a minimal model registry — the two things a registry
actually does:

```json
{
  "price_model.pkl": {
    "version": "v2-histgb-log",
    "sha256": "613fab374e45…",
    "git_sha": "612a422",
    "trained_at": "2026-09-20",
    "metrics": { "mae": 1640.1, "r2": 0.982 }
  }
}
```

The service **checksums every model before loading it**. A mismatch means the artifact is not
the one that passed validation, so it is refused and the documented heuristic serves instead —
a verified heuristic beats an unverified model. `GET /health` reports the pinned versions, so a
prediction is always traceable to a model and the commit that produced it.

### The validation gate

`python scripts/validate_models.py` exits non-zero if a model is unfit. CI runs it twice: once
against the committed artifacts, then again after retraining from scratch, so reproducibility is
part of the build.

It checks accuracy loosely and **invariants strictly**, because a model can be accurate and
still incoherent:

- price within 35% of the computable accuracy ceiling; the ±band covers ~80% of actual prices
- trust: completing a job never lowers the score, a dispute never raises it, a new worker lands near neutral
- ranker: no feature may carry a negative weight (this gate already rejected a 0.87-AUC model that penalised relevance)

### Retraining

```bash
cd ai-service
python scripts/build_rate_anchors.py
python scripts/generate_price_data.py  && python scripts/train_price_model.py
python scripts/generate_trust_data.py  && python scripts/train_trust_model.py
python scripts/build_manifest.py          # re-pin: version + checksum + git sha
python scripts/validate_models.py         # must pass before committing
```

Commit the new `.pkl` + `manifest.json` together. They are a matched pair — a stale manifest
fails the checksum and the model is refused.

---

## Hosting

| Service | Host | Notes |
| --- | --- | --- |
| frontend | Vercel, or the nginx image anywhere | `vercel.json` handles SPA rewrites |
| backend | Render / Railway / Fly.io (Docker) | **Not Vercel** — Socket.io needs a persistent connection |
| ai-service | Render / Railway / Fly.io / HF Spaces (Docker) | 512 MB RAM is enough (measured: 152 MB steady, 351 MB peak) |

### Environment

**backend**
```env
NODE_ENV=production
CLIENT_URL=https://your-app.vercel.app     # exact origin, or CORS and Socket.io reject the browser
MONGODB_URI=mongodb+srv://…                # percent-encode special characters in the password
JWT_SECRET=…
STRIPE_SECRET_KEY=sk_test_…                # validated at boot: test keys only
CLOUDINARY_CLOUD_NAME=… CLOUDINARY_API_KEY=… CLOUDINARY_API_SECRET=…
AI_SERVICE_URL=https://your-ai-service…
```

**frontend** (build-time — Vite inlines these, so rebuild after changing)
```env
VITE_API_URL=https://your-backend…         # no trailing slash, no /api
VITE_STRIPE_PUBLISHABLE_KEY=pk_test_…
```

**ai-service** — `ALLOWED_ORIGINS` (the backend's origin) and optionally `SERVICE_API_KEY`.

### AI service on Hugging Face Spaces

Spaces is the best free option for this container: 2 vCPU / 16 GB RAM, versus 512 MB on Render's
free tier. The image already satisfies its two requirements — it runs as uid 1000 and needs no
writable filesystem outside `/tmp`.

1. **Create the Space** — huggingface.co → New Space → **SDK: Docker** (blank template),
   hardware *CPU basic (free)*. Visibility public, so your backend can reach it.

2. **Push `ai-service/` as the Space root.** Spaces expects `Dockerfile` and `README.md` at the
   top level, which is what the subtree push produces:

   ```bash
   git remote add hf https://USER:HF_TOKEN@huggingface.co/spaces/USER/worknest-ai
   git subtree push --prefix ai-service hf main
   ```
   Use a **write** token from huggingface.co/settings/tokens. Re-run the same command to deploy
   later changes.

3. **Configuration is already committed.** The YAML front matter in `ai-service/README.md`
   (`sdk: docker`, `app_port: 8000`) tells Spaces how to run and route to the container.

4. **Add a variable** in Space → Settings → Variables:
   `ALLOWED_ORIGINS = https://your-backend.onrender.com`

5. **First build takes ~10 minutes** (installing scipy/onnxruntime and baking in the embedding
   model). Watch the Logs tab. The build asserts the models load and checksum-match, so a
   failure there is a real problem, not a flake.

6. **Point the backend at it** — on Render set
   `AI_SERVICE_URL=https://USER-worknest-ai.hf.space` and redeploy.

Verify: `curl https://USER-worknest-ai.hf.space/health` should report
`{"matching":"semantic-bge-small-v1","trust":"gb-worknest-v2-monotonic","pricing":"gb-worknest-v2"}`.

**Caveat:** free Spaces pause after ~48 hours of inactivity and need a restart (a visit to the
Space page wakes them). Fine for a portfolio; wake it before a demo.

### Order

backend → copy its URL into the frontend build → deploy frontend → copy that URL into the
backend's `CLIENT_URL` → redeploy backend.

Also: **Atlas → Network Access → allow `0.0.0.0/0`**, or the deployed backend cannot connect.

### Keeping free-tier services awake

Render spins a free service down after ~15 minutes idle. A cold AI service takes ~30 s to wake —
longer than the backend's request timeout — so the first search after an idle period silently
returns keyword results instead of AI-ranked ones.

`.github/workflows/keep-warm.yml` pings both services every 10 minutes and **fails loudly** if
the AI path is broken (wrong `AI_SERVICE_URL`, `AI_ENABLED=false`, models not loading). Run it
manually from the Actions tab a few minutes before a demo.

Point it at your own URLs with repo variables (Settings → Secrets and variables → Actions →
Variables): `API_URL` and `AI_URL`. It falls back to the deployed defaults otherwise.

Also raise the backend's patience so a *waking* service isn't cut off mid-handshake:

```env
AI_SERVICE_TIMEOUT_MS=15000    # on the backend service; default 4000 is too tight for a cold start
```

Pre-demo check — this is the one command that tells you whether the AI path is live:

```bash
curl -s "https://your-backend.onrender.com/api/workers?mode=smart&q=leaking%20pipe" | grep -o '"mode":"[a-z]*"'
# "mode":"smart"   → AI ranking is live
# "mode":"keyword" → AI asleep or unreachable; wait 30s and retry
```

### Things that will bite you

- **Free tiers sleep.** Render idles after 15 minutes; the first request takes ~50 s. Warm both
  the API and the AI service a few minutes before a demo.
- **A sleeping AI service degrades silently** — search falls back to keyword mode and the Trust
  Score to the heuristic. Correct behaviour, but not what you want mid-demo.
- **The Stripe webhook can't reach a sleeping service.** That is exactly why the client also
  calls `POST /api/bookings/:id/payment/sync` after confirming a card.
- **If the AI service won't fit**, set `AI_ENABLED=false` on the backend. The app keeps working.
