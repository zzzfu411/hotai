# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Hot AI — a daily-aggregator + Claude-summarised site for AI news.

**Project scope (hard boundaries — see [`docs/design.md`](docs/design.md) for the full rationale):**
- Articles are **deleted after 14 days**. Postgres never holds more than 2 weeks of content; the site is "today's hot", not an archive.
- **No user system.** No accounts, no login, no per-user state. Every visitor sees the same "today's hot list".
- **No personalised recommendations.** Ranking is global: source weight × time decay × signals × `aiImportance`.
- **Every new article goes through the LLM** to produce a summary, topic tags, sentiment, and an importance score that feeds back into the ranking formula.
- Daily **digest** is the canonical "push" channel — a single editor-style brief generated each day for everyone.

Do not introduce features that violate these boundaries (user tables, follow/save, push-with-auth, long-term archive, etc.) without an explicit project-scope change in `docs/design.md`. The "Already excluded" section there lists common rejected ideas.

Four workspaces in a pnpm monorepo (Node ≥ 20, pnpm 9.12):

- `apps/web` — Next.js 14 (App Router, SSR + ISR). Reads from Postgres directly via Prisma. Hosts the streaming `/api/ask` and JSON `/api/digest` endpoints.
- `apps/fetcher` — long-running Node worker. Pulls from RSS / scrapes / HuggingFace / GitHub Trending on a cron, dedupes, scores, upserts. After each cycle it also runs the AI enrichment pipeline and refreshes today's digest.
- `packages/db` — Prisma schema + generated client + seed script. Imported as `@hotai/db`. Its `main` points at `src/index.ts` (no build step for consumers, but `prisma generate` must have run).
- `packages/ai` — Anthropic SDK wrapper. Speaks the `/v1/messages` protocol — works against api.anthropic.com directly OR any relay that implements the same protocol (set `ANTHROPIC_BASE_URL`). Exports `enrichArticle`, `generateDigest`, `client()`, `systemBlock()`, `AI_MODELS`, and an `AI_ENABLED` flag that's true iff `ANTHROPIC_API_KEY` is set. Model IDs are read from `LLM_MODEL_FAST` / `LLM_MODEL_SMART` env vars (defaults: Claude Haiku 4.5 / Sonnet 4.6). **Every AI path must check `AI_ENABLED` and fail soft** — the site must keep working without the key.

## Common commands

All run from the repo root:

```bash
pnpm install
pnpm db:generate          # prisma generate — required after schema changes or fresh clone
pnpm db:migrate           # prisma migrate deploy (prod-style); use `pnpm --filter @hotai/db migrate:dev --name <name>` to author new migrations
pnpm db:seed              # populate the Source table from packages/db/src/seed.ts
pnpm db:studio            # Prisma Studio

pnpm dev:web              # Next dev server on :3000
pnpm dev:fetcher          # tsx watch — runs scheduler immediately, then on cron
pnpm fetch:once           # one fetch+enrich+digest cycle, then exit (validation / manual trigger)

pnpm build                # builds db (prisma generate) → web (next build) → fetcher (tsc)
```

No test runner is configured. `pnpm --filter @hotai/web lint` runs `next lint`.

A running Postgres is required for almost everything (web SSR, fetcher, migrate, seed). Default connection string in `.env.example` assumes the Docker command in `README.md`.

## Architecture notes worth knowing up front

**Data flow.** Fetcher is the only writer. Web is read-only against the same DB. After each fetch cycle the fetcher (1) runs AI enrichment on still-unanalysed top-scored articles, (2) refreshes today's `Digest` row if older than 6h, (3) POSTs to `apps/web/app/api/revalidate/route.ts` (authenticated by `REVALIDATE_SECRET`) to invalidate ISR for `/` and `/digest`. If the env vars are unset the call is silently skipped — fine for local dev where `revalidate = 600` handles it.

**Fetcher dispatch.** `apps/fetcher/src/dispatch.ts` first looks up `source.slug` in a per-slug map (custom integrations: `github-trending`, `huggingface-trending`, `huggingface-papers`), then falls back to a per-type map (`rss` → generic RSS parser, `scrape` → Chinese-media list scraper). Adding a bespoke source: add a row in `packages/db/src/seed.ts`, add a fetcher in `apps/fetcher/src/sources/`, wire it in `dispatch.ts`, then re-run `pnpm db:seed`.

**Dedupe + scoring.** All articles are upserted by `urlHash` (SHA-1 of a URL with UTM-style params stripped — see `dedupe.ts`). `titleHash` is stored for future cross-source dedupe but is not currently used as a uniqueness constraint. `scoring.ts` combines source weight, exponential time decay (`SCORING_HALFLIFE_HOURS`), log-compressed engagement signals, and a keyword bonus (`SCORING_KEYWORDS`). Score is recomputed on every upsert, so re-running the fetcher refreshes ranking even when no new items arrive.

**HuggingFace trending dates are clamped.** HF's API returns `lastModified` which is often years old for popular models — that would tank the time-decay score. `apps/fetcher/src/sources/huggingface.ts` substitutes `now()` when `lastModified` is older than 30 days so a "trending today" model lands at the top of the score curve.

**AI enrichment is idempotent + capped.** `enrich.ts` queries `Article` rows with `aiAnalyzedAt is null`, ordered by score, capped at `AI_ENRICH_PER_RUN`. Failed enrichments still mark `aiAnalyzedAt` (with `aiModel="skipped"`) so we don't hot-loop on a single bad item. Concurrency is bounded by `AI_CONCURRENCY` workers.

**Prompt caching is opt-out.** `packages/ai/src/client.ts` exports `systemBlock(text)` which wraps the string into a system block and attaches `cache_control: { type: "ephemeral" }` iff `AI_PROMPT_CACHE` is truthy (default true). Anthropic-direct: keep it on, batch enrichment becomes much cheaper. **Most third-party relays don't implement the cache controls and will return 400 if the field is present** — flip `AI_PROMPT_CACHE=false` in `.env` for those. Always use `systemBlock()` instead of constructing the array inline so this stays in one place.

**Prisma client singleton.** `packages/db/src/index.ts` stashes the client on `globalThis` in non-prod to survive Next dev hot-reload. Always import from `@hotai/db`, never construct `new PrismaClient()` elsewhere.

**ESM in fetcher and ai.** Both `apps/fetcher` and `packages/ai` are `"type": "module"`; intra-package imports use explicit `.js` extensions (e.g. `./dispatch.js`) even though the source is `.ts` — required by tsx/Node ESM resolution. Preserve this when adding files.

**Theme without FOUC.** `components/ThemeToggle.tsx` exports both the toggle button AND a `ThemeNoFlashScript` that's rendered inside `<head>` in `layout.tsx`. The script reads localStorage + `prefers-color-scheme` and sets the `dark` class before paint. If you add new theme-affecting state, run it through the same pattern — don't add a second blocking script.

**Streaming SSE endpoint.** `/api/ask` is `runtime: "nodejs"` (not edge — Anthropic SDK uses Node streams) and returns `text/event-stream` with lines `data: {"delta":"…"}` and a final `data: {"done":true}`. The client at `components/AskBox.tsx` parses this format; if you change the wire format, update both.

## Production

PM2 (`ecosystem.config.js`) runs two processes: `hotai-web` (`next start`) and `hotai-fetcher` (tsx — note: not the compiled `dist/index.js`, even though `pnpm build` produces one). Nginx + certbot setup lives in `deploy/`.

## Art assets

Logo / favicons / OG image specs live in [`docs/ART_REQUIREMENTS.md`](docs/ART_REQUIREMENTS.md). The repo ships placeholder SVGs in `apps/web/public/`; replacing them is purely a drop-in.

## Design / roadmap

[`docs/design.md`](docs/design.md) is the canonical place for current architecture details, known pain points, optimisation proposals, and the ROI-sorted sprint plan. Before redesigning a core module (scoring, dedupe, AI pipeline, ranking), check there first — it captures decisions and trade-offs that aren't visible in the code.
