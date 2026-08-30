# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

Hot AI — NewsNook-style live RSS reader on the web, with a small **Hot AI module** (`/hot`, `/digest`, `/api/ask`) that ranks and summarises AI-industry stories.

**Project scope (hard boundaries — see [`docs/design.md`](docs/design.md) for the full rationale):**
- **Postgres `Article` rows are deleted after 14 days.** That table is only the Hot AI module corpus, not the 速闻 timeline. The homepage catalog is fetched live and never written to `Article`.
- **No user system.** No accounts, no login. localStorage may hold source toggles / OPML / later-read (explicit, device-local).
- **No personalised recommendations.** The `/hot` ranking is global: source weight × time decay × signals × `aiImportance`. The 速闻 mix is chronological.
- **Every new `Article` (fetcher pipeline) goes through the LLM.** Catalog/OPML items do **not** — they are a reading client, like NewsNook.
- Daily **digest** remains the Hot AI module's editor brief, not the default homepage.

Do not introduce features that violate these boundaries (user tables, follow/save, push-with-auth, long-term archive, etc.) without an explicit project-scope change in `docs/design.md`. The "Already excluded" section there lists common rejected ideas.

Four workspaces in a pnpm monorepo (Node ≥ 20, pnpm 9.12):

- `apps/web` — Next.js 14 (App Router, SSR + ISR). Reads from Postgres directly via Prisma. Hosts the streaming `/api/ask` and JSON `/api/digest` endpoints.
- `apps/fetcher` — long-running Node worker. Pulls from RSS / scrapes / HuggingFace / GitHub Trending on a cron, dedupes, scores, upserts. After each cycle it also runs the AI enrichment pipeline and refreshes today's digest.
- `packages/db` — Prisma schema + generated client + seed script. Imported as `@hotai/db`. Its `main` points at `src/index.ts` (no build step for consumers, but `prisma generate` must have run).
- `packages/ai` — Anthropic SDK wrapper. Speaks the `/v1/messages` protocol — works against api.anthropic.com directly OR any relay that implements the same protocol (set `ANTHROPIC_BASE_URL`). Exports `enrichArticle`, `enrichArticles` (batch — one LLM call for N articles, returns null on shape mismatch so callers can fall back to singles), `generateDigest`, `client()`, `systemBlock()`, `parseJson()` (fence/prose-tolerant), `AI_MODELS`, and an `AI_ENABLED` flag that's true iff `ANTHROPIC_API_KEY` is set. Model IDs are read from `LLM_MODEL_FAST` / `LLM_MODEL_SMART` env vars (defaults: Claude Haiku 4.5 / Sonnet 4.6). **Every AI path must check `AI_ENABLED` and fail soft** — the site must keep working without the key.

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

pnpm test                 # vitest — pure-function tests, no DB needed
pnpm typecheck            # tsc --noEmit for fetcher + ai + web
pnpm build                # builds db (prisma generate) → web (next build) → fetcher (tsc)
```

No test runner beyond vitest: `pnpm test` runs pure-function unit tests (scoring / dedupe / merge / LLM-JSON parsing) with no DB dependency; `pnpm typecheck` runs `tsc --noEmit` over fetcher, ai, and web. `pnpm --filter @hotai/web lint` runs `next lint`.

A running Postgres is required for almost everything (web SSR, fetcher, migrate, seed). Default connection string in `.env.example` assumes the Docker command in `README.md`.

## Architecture notes worth knowing up front

**Data flow.** Fetcher is the only writer to content tables. Web is read-only against the same DB except two deliberate writes: on-demand digest generation (`apps/web/lib/digest.ts`) and the `/api/ask` answer cache (`AskCache` table). All web reads go through `apps/web/lib/queries.ts` — don't embed Prisma queries in pages. After each fetch cycle the fetcher (1) runs AI enrichment on still-unanalysed top-scored articles, (2) refreshes today's `Digest` row if older than 6h, (3) POSTs to `apps/web/app/api/revalidate/route.ts` (authenticated by `REVALIDATE_SECRET`) to invalidate ISR for `/` and `/digest`. If the env vars are unset the call is silently skipped — fine for local dev where `revalidate = 600` handles it. The retention pass also purges `AskCache` rows older than `ASK_CACHE_TTL_HOURS`.

**Fetcher orchestration.** `apps/fetcher/src/index.ts` is bootstrap/cron only; the pipeline lives in `cycle.ts` (purge → fetch each source → persist → enrich → digest → revalidate). `dispatch.ts` first looks up `source.slug` in a per-slug map (custom integrations: `github-trending`, `huggingface-trending`, `huggingface-papers`), then falls back to a per-type map (`rss` → generic RSS parser, `scrape` → Chinese-media list scraper) — and **throws** when nothing matches. Per-source health lives in `sourceHealth.ts`: failures increment `Source.consecutiveFails` (with `lastError`/`lastErrorAt`), success resets it, and `SOURCE_FAIL_THRESHOLD` consecutive failures auto-set `enabled=false` (a scrape source returning 0 items counts as a failure — stale selectors). Adding a bespoke source: add a row in `packages/db/src/seed.ts`, add a fetcher in `apps/fetcher/src/sources/`, wire it in `dispatch.ts`, then re-run `pnpm db:seed`.

**Dedupe + scoring.** `store.ts#persistItems` applies a dedupe ladder per item: (1) `urlHash` hit (SHA-1 of a normalized URL — UTM-style params stripped, arXiv links canonicalized to `https://arxiv.org/abs/<id>` with the `vN` suffix removed — see `dedupe.ts`) → refresh: signals merged per-key max, score recomputed; (2) `titleHash` hit within `TITLE_DEDUPE_WINDOW_DAYS` (default 3) → repost: signals merged and the repost recorded in the canonical row's `crossPosts` JSON, **no new row**; (3) create. Titles whose normalized form is under 8 chars never title-merge (recurring "weekly thread" guard). Pure merge helpers live in `merge.ts`. `scoring.ts` combines source weight, exponential time decay (`SCORING_HALFLIFE_HOURS`), log-compressed engagement signals, a keyword bonus (`SCORING_KEYWORDS`), and `aiImportance × AI_IMPORTANCE_WEIGHT`. Score is recomputed on every upsert (preserving the row's stored `aiImportance`), so re-running the fetcher refreshes ranking even when no new items arrive.

**HuggingFace trending dates are clamped.** HF's API returns `lastModified` which is often years old for popular models — that would tank the time-decay score. `apps/fetcher/src/sources/huggingface.ts` substitutes `now()` when `lastModified` is older than 30 days so a "trending today" model lands at the top of the score curve. Daily papers come from the `api/daily_papers` JSON endpoint (includes abstracts), not the HTML page.

**AI enrichment is idempotent + capped + batched.** `enrich.ts` queries `Article` rows with `aiAnalyzedAt is null`, ordered by score, capped at `AI_ENRICH_PER_RUN`, grouped into `AI_BATCH_SIZE` articles per LLM call (misaligned batch output degrades to per-article calls). Failed enrichments still mark `aiAnalyzedAt` (with `aiModel="skipped"`) so we don't hot-loop on a single bad item. A successful enrichment writes the AI fields **and a recomputed score** (with the fresh `aiImportance`) in the same update. Concurrency is bounded by `AI_CONCURRENCY` workers over batches.

**Prompt caching is opt-out.** `packages/ai/src/client.ts` exports `systemBlock(text)` which wraps the string into a system block and attaches `cache_control: { type: "ephemeral" }` iff `AI_PROMPT_CACHE` is truthy (default true). Anthropic-direct: keep it on, batch enrichment becomes much cheaper. **Most third-party relays don't implement the cache controls and will return 400 if the field is present** — flip `AI_PROMPT_CACHE=false` in `.env` for those. Always use `systemBlock()` instead of constructing the array inline so this stays in one place.

**Prisma client singleton.** `packages/db/src/index.ts` stashes the client on `globalThis` in non-prod to survive Next dev hot-reload. Always import from `@hotai/db`, never construct `new PrismaClient()` elsewhere.

**ESM in fetcher and ai.** Both `apps/fetcher` and `packages/ai` are `"type": "module"`; intra-package imports use explicit `.js` extensions (e.g. `./dispatch.js`) even though the source is `.ts` — required by tsx/Node ESM resolution. Preserve this when adding files.

**Theme without FOUC.** `components/ThemeToggle.tsx` exports both the toggle button AND a `ThemeNoFlashScript` that's rendered inside `<head>` in `layout.tsx`. The script reads localStorage + `prefers-color-scheme` and sets the `dark` class before paint. If you add new theme-affecting state, run it through the same pattern — don't add a second blocking script.

**Streaming SSE endpoint.** `/api/ask` is `runtime: "nodejs"` (not edge — Anthropic SDK uses Node streams) and returns `text/event-stream` with lines `data: {"delta":"…"}` and a final `data: {"done":true}`. The client at `components/AskBox.tsx` parses this format; if you change the wire format, update both. The endpoint is publicly reachable and spends tokens, so three guards run in order (`lib/ask-guard.ts`): per-IP rate limit (`ASK_RATE_PER_IP`) → `AskCache` lookup (identical normalized question within `ASK_CACHE_TTL_HOURS` streams the cached answer, no LLM call, no quota) → daily token valve (`ASK_DAILY_TOKEN_LIMIT`, 0 = unlimited). Rate/quota counters are in-memory (single PM2 fork; reset on restart is accepted).

## Production

PM2 (`ecosystem.config.js`) runs two processes: `hotai-web` (`next start`) and `hotai-fetcher` (tsx — note: not the compiled `dist/index.js`, even though `pnpm build` produces one). Nginx + certbot setup lives in `deploy/`.

## Art assets

Logo / favicons / OG image specs live in [`docs/ART_REQUIREMENTS.md`](docs/ART_REQUIREMENTS.md). The repo ships placeholder SVGs in `apps/web/public/`; replacing them is purely a drop-in.

## Design / roadmap

[`docs/design.md`](docs/design.md) is the canonical place for current architecture details, known pain points, optimisation proposals, and the ROI-sorted sprint plan. Before redesigning a core module (scoring, dedupe, AI pipeline, ranking), check there first — it captures decisions and trade-offs that aren't visible in the code.
