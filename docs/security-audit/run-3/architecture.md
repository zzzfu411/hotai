# Hot AI Security Audit Run 3 - Architecture and Scope

Date: 2026-09-01  
Target: `D:\\Develop\\claude\\hotai`  
Baseline commit: `b631bb4608790413b1366dce7412d9cd4ca66ad4`  
Working tree: intentionally dirty; the current task continues an unfinished hardening/refactor batch.

## Application profile

Hot AI is an anonymous public news aggregator. The Next.js web application renders a NewsNook RSS-like feed and a Hot AI ranking, while a separate Node fetcher periodically retrieves configured sources, persists articles in PostgreSQL through Prisma, and optionally enriches content or produces a daily digest through an Anthropic-compatible provider. There are no accounts, sessions, roles, personal feeds, or per-user ownership boundaries by design. Public pages and most API routes are therefore intentionally unauthenticated.

The explicit authorization gates are:

- `POST /api/revalidate`: a shared `x-revalidate-secret`, an 8 KiB body limit, and a fixed path allowlist.
- `GET /api/metrics`: an optional `Authorization: Bearer` token (`OBSERVABILITY_TOKEN`) compared with a timing-safe digest.
- All other web reads and anonymous utility endpoints are public by product definition.

## Components and data flow

1. **Web / Next.js.** Pages read Article, Source, Digest, and CuratedBlog rows. `/api/ask` accepts a question, builds a corpus from recent articles, streams an LLM answer over SSE, and writes `AskCache`/quota state. `/api/readability`, `/api/proxy/feed`, `/api/catalog/pull`, and the Juya page fetch remote content through the SSRF-aware `fetchPublic` helper.
2. **Fetcher.** Cron-driven source dispatch reads operator-controlled Source URLs, follows redirects with `apps/fetcher/src/http.ts`, parses RSS/Atom/JSON/custom sources, applies retention/dedupe/scoring, and persists rows. It also runs AI enrichment and digest work under PostgreSQL-backed leases.
3. **Database.** Prisma models include `Source`, `Article`, `Digest`, `AskCache`, `AskDailyUsage`, `AskReservation`, `CoordinationLease`, `RateLimitBucket`, and `CuratedBlog`. Three migration directories are present but untracked in the current worktree (`ai_retry_state`, `ask_quota`, `coordination_observability`), so a production rollout must apply them before using the current code.
4. **External providers.** Browser-triggered fetches use DNS resolution, private-address checks, manual redirect validation, response-size limits, and a pinned undici agent in `apps/web/lib/ssrf.ts`. AI requests can use the official Anthropic endpoint or an explicitly opted-in compatible relay. The fetcher HTTP client is a separate trust boundary and currently assumes Source rows are operator-controlled.

## Trust boundaries and sinks

- Unauthenticated HTTP input enters API JSON/query parameters, browser subscription text, and `url` values in reader/feed routes.
- Upstream feed/XML/JSON and Juya HTML are untrusted content. Remote HTML is sanitized and then inserted with `dangerouslySetInnerHTML`; URL attributes are revisited with `safeHttpUrl`.
- Article fields are stored in PostgreSQL and later emitted in HTML, RSS XML, JSON Feed, OPML, prompts, and external links.
- AI prompts contain article titles, summaries, source names, URLs, and (for Ask) an anonymous question. Model output is parsed and normalized before persistence/rendering.
- State-changing or cost-bearing operations are anonymous but bounded by PostgreSQL quota/lease logic and per-IP rate limiting. Digest fallback is a special anonymous write/cost path.
- The fetcher sends outbound HTTP requests to Source URLs and a revalidation callback; those values are deployment/operator inputs rather than public user input.

## Existing controls verified before Phase 2

- Streamed request-body caps (`apps/web/lib/request.ts`).
- PostgreSQL advisory-lock quota reservations and expiry settlement for Ask.
- Shared database rate limiting with bounded in-process fallback maps.
- Nginx overwriting `X-Real-IP` and `X-Forwarded-For` in the documented single-proxy topology.
- SSRF checks for schemes, credentials, literal/private/metadata addresses, DNS answers, redirects, timeouts, and response bytes; DNS is pinned for the request.
- DOMPurify/linkedom sanitization, forbidden style/script-like elements and attributes, URL-attribute filtering, and `srcset` removal.
- Fail-closed AI configuration: empty example credentials, placeholder rejection, dual-credential rejection, explicit non-local third-party relay opt-in, and insecure-HTTP opt-in outside the local development loopback exception.
- Retention checks on writes and reads, AI enrichment CAS/lease/retry state, and parameterized Prisma queries.

## Prior audit coverage

`docs/security-audit/run-1` and `run-2` recorded three confirmed historical findings: unsafe AI relay/key routing, forged X-Forwarded-For rate-limit bypass, and Juya inline-style viewport overlay. The current worktree contains the documented remediations and regression tests; this run treats them as closed and hunts for new paths. Prior rejected candidates included executable `javascript:`/`data:` XSS and an unconditionally exploitable NAT64 SSRF; they remain deployment-specific hardening notes, not findings.

## Current local verification limits

Node is `v24.11.1` (the package/CI target is Node 22.22.2). `pnpm test`, `pnpm typecheck`, and `pnpm lint` pass locally. The test suite skips database integration tests because no PostgreSQL service is listening on `localhost:5432`; Docker is installed but its daemon is unavailable. `pnpm build` compiles through TypeScript but fails during static page data generation when `/blogs` cannot connect to PostgreSQL. No production database, proxy chain, provider logs, or external network topology was inspected. The gitignored local `.env` was not copied into audit artifacts or logs; it contains a non-empty credential and relay settings that must be treated as sensitive and rotated if they were ever deployed.

## Audit focus for this run

Phase 2 prioritizes (a) parser/validator mismatches in remote feeds and browser sinks, (b) anonymous cost/quota/cache/lease state machines and failure paths, (c) AI prompt/output boundaries, and (d) configuration, secret, deployment, and obvious forgotten endpoints. Any candidate must have a concrete attacker-controlled input and meaningful impact; operator-only trust assumptions and defense-in-depth gaps will be reported separately as hardening notes.
