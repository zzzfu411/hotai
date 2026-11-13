# Deployment, Routes & AI Pipeline Reference

This document archives the complete route map, AI enrichment/Q&A pipeline mechanics, third-party relay configuration, health/metrics contracts, and production bootstrap steps previously kept in the root `README.md`. For the full step-by-step VPS runbook (initial setup, worktree releases, `pg_dump` backups, and rollbacks), see [`../deploy/README.md`](../deploy/README.md).

## Routes & API Endpoints

| Path | Description |
| --- | --- |
| `/` | Live multi-source news reader (in-memory RSS/Atom/JSON Feed cache; composite/headline tabs ranked by editorial signals, other tabs chronological; never written to `Article`) |
| `/hot` | Hot AI module: ranked 14-day PostgreSQL `Article` feed + Today's Pulse |
| `/digest` | Daily AI brief + streaming AskBox |
| `/juya` | Juya AI daily brief (`daily.juya.uk` RSS, formatted in-app, not stored in PostgreSQL) |
| `/r` | In-app Readability view for live feed items (not stored in PostgreSQL) |
| `/a/[id]` | In-app reader for ranked `Article` rows (AI summary + extracted body) |
| `/search?q=…` | Substring search across `Article` titles, summaries, and topic tags |
| `/category/{slug}` | Category timeline ordered by `publishedAt` (`research` / `industry` / `opensource` / `media`) |
| `/source/{slug}` | Single-source `Article` timeline |
| `/blogs` | Curated long-form AI researcher & practitioner blog directory (`CuratedBlog`) |
| `/subscribe` | Browser-local reading history, custom RSS feeds, and OPML import/export (`localStorage`) |
| `/feed.xml` | RSS 2.0 feed (uses AI summary when available, falls back to raw source summary) |
| `/feed.json` | JSON Feed 1.1 |
| `/hotai.opml` | Curated editorial RSS sources + blogs OPML |
| `/api/ask` | `POST` — Streaming SSE Q&A grounded in the past 48h of `Article` rows, with in-app `[n]` citations |
| `/api/digest` | `GET` — Today's digest as JSON |
| `/api/readability` | `POST { url }` — Server-side article extraction with SSRF protection |
| `/api/proxy/feed` | `GET ?url=` — Proxy for user-configured custom feeds (never stored in DB) |
| `/api/catalog/pull` | `POST { ids }` — Live multi-source RSS pull for `/` (never stored in DB) |
| `/api/revalidate` | `POST` — Cache invalidation hook called by `apps/fetcher` (`x-revalidate-secret`) |
| `/api/live` | `GET` — Process liveness check (no database query) |
| `/api/health` | `GET` — Readiness check covering PostgreSQL, fetch freshness, source health, AI leases, digest, and Ask quota |
| `/api/metrics` | `GET` — Prometheus text metrics gated by `Authorization: Bearer <OBSERVABILITY_TOKEN>` |

## Fetcher, Dedupe & AI Pipeline

`apps/fetcher` runs hourly (at `:07` via `deploy/systemd/hotai-fetcher.timer` in production, or resident cron via `FETCHER_CRON` in dev) under a cross-process PostgreSQL cycle lease (`FETCHER_CYCLE_LEASE_SECONDS`, default `300`).

1. **Retention & ingestion** — Purges `Article` rows older than `ARTICLE_RETENTION_DAYS` (default `14`), fetches enabled sources with `FETCH_CONCURRENCY`, merges URL matches and 3-day cross-source reposts (`TITLE_DEDUPE_WINDOW_DAYS="3"`), and opens a timed circuit (`autoPausedUntil` for `SOURCE_RETRY_MINUTES="60"`) after `SOURCE_FAIL_THRESHOLD` (`5`) consecutive failures.
2. **Batched AI enrichment (`enrichPendingArticles`)** — Claims top-ranked `pending`, due `retry`, or expired `processing` rows using a PostgreSQL lease + `aiAttempts` CAS, then calls `LLM_MODEL_FAST` in batches (`AI_ENRICH_PER_RUN`, `AI_BATCH_SIZE`, `AI_CONCURRENCY`) to generate bilingual summaries, topic tags, categories, and `aiImportance`. Failed items back off exponentially and enter `failed` only after 6 consecutive attempts; successful updates recompute the hot score immediately.
3. **Daily digest (`ensureTodayDigest` / `runDigestGeneration`)** — Synthesizes top-40 daily stories with `LLM_MODEL_SMART` into `Digest`. Both `apps/fetcher` and the first-visitor fallback in `apps/web` share one PostgreSQL lease (`DIGEST_GENERATION_LEASE_SECONDS`), renewing during model calls and verifying lease ownership inside the commit transaction, with a 6-hour refresh cooldown within the same UTC day.
4. **Streaming Q&A guardrails (`/api/ask`)** — Enforces per-IP rate limits (`ASK_RATE_PER_IP`), checks corpus-versioned `AskCache` (storing exact citation snapshots so `[n]` references never drift when rankings change), coalesces concurrent misses with a single-flight PostgreSQL lease, and atomically reserves daily token budget (`ASK_DAILY_TOKEN_LIMIT`) and concurrency slots (`ASK_MAX_CONCURRENT`, `ASK_RESERVATION_TTL_SECONDS`, clamped to `>= 300s`). When PostgreSQL is unavailable, quota checks fail closed.
5. **Public fetch rate limits** — `/api/proxy/feed`, `/api/readability`, and `/api/catalog/pull` share PostgreSQL fixed-window IP buckets (storing SHA-256 IP digests up to `PUBLIC_RATE_LIMIT_MAX_KEYS`). On DB outage, new upstream fetches are blocked while `/` may still serve safe in-memory snapshots within a 45-minute window.

## Anthropic `/v1/messages` & Third-Party Relay Opt-In

`@hotai/ai` uses `@anthropic-ai/sdk` over the standard `/v1/messages` protocol. Leaving both `ANTHROPIC_API_KEY` and `ANTHROPIC_AUTH_TOKEN` empty keeps AI disabled cleanly across the entire app; setting both simultaneously is rejected at startup.

```ini
ANTHROPIC_AUTH_TOKEN=""           # Bearer auth (set either this OR ANTHROPIC_API_KEY, never both)
ANTHROPIC_API_KEY=""              # X-Api-Key auth (official Anthropic or compatible relay)
ANTHROPIC_BASE_URL=""             # Empty = https://api.anthropic.com (omit trailing /v1)
ALLOW_THIRD_PARTY_AI="false"      # Must be explicitly "true" for non-Anthropic hosts
ALLOW_INSECURE_AI_HTTP="false"    # Keep "false" outside localhost testing
LLM_MODEL_FAST="claude-haiku-4-5" # Override with model IDs accepted by your endpoint
LLM_MODEL_SMART="claude-sonnet-4-6"
AI_PROMPT_CACHE="false"           # Set "false" for relays that reject ephemeral cache_control
AI_STREAM_THINKING_BUDGET="0"     # Optional (1024–16000) for reasoning-model relays on /api/ask
```

See [`.env.example`](../.env.example) for the complete list of scoring, retention, lease, and rate-limit variables.

## Health & Observability

- `/api/live` — Verifies the Next.js web process responds without touching PostgreSQL.
- `/api/health` — Checks PostgreSQL connectivity, latest fetch age (`HEALTH_MAX_FETCH_AGE_SECONDS`, returns HTTP `503` when stale), enabled sources, expired AI/fetcher leases, digest status, and Ask quota state, plus process-scoped live catalog status.
- `/api/metrics` — Exports low-cardinality Prometheus metrics; disabled (`404`) until `OBSERVABILITY_TOKEN` is configured with at least 32 random bytes (`openssl rand -hex 32`) and queried with `Authorization: Bearer <token>`.

## Production Bootstrap Summary

```bash
bash deploy/setup.sh
cp .env.example .env && chmod 600 .env   # fill DATABASE_URL (.db-password), REVALIDATE_SECRET, etc.
pnpm install --frozen-lockfile
pnpm db:generate && pnpm db:migrate && pnpm db:seed
pnpm fetch:once && pnpm build && pnpm release:check

sudo cp deploy/nginx.conf /etc/nginx/sites-available/hotai
sudo ln -sf /etc/nginx/sites-available/hotai /etc/nginx/sites-enabled/hotai
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d hotai.yeuxark.com
sudo cp deploy/nginx-https.conf /etc/nginx/sites-available/hotai
sudo nginx -t && sudo systemctl reload nginx

ln -sfn "$PWD" /root/hotai-current
sudo cp deploy/systemd/hotai-* /etc/systemd/system/ && sudo systemctl daemon-reload
sudo systemctl enable --now hotai-web hotai-fetcher.timer
RELEASE_BASE_URL=http://127.0.0.1:3000 pnpm release:check
```

For zero-downtime `git worktree` upgrades, systemd memory guardrails (`MemoryHigh` / `MemoryMax`), worker-thread HTML sanitization notes, and PostgreSQL backup/restore drills, see [`../deploy/README.md`](../deploy/README.md).
