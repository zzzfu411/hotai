import { config } from "./config.js";

export type Signals = {
  points?: number;      // HN points, reddit upvotes, HF paper upvotes
  comments?: number;
  stars?: number;       // GitHub stars today, HF likes
  downloads?: number;   // HF downloads
};

export type ScoreInput = {
  sourceWeight: number;
  sourceSlug?: string;
  publishedAt: Date;
  title: string;
  summary?: string | null;
  signals?: Signals | null;
  // LLM's 0-1 importance estimate; null/undefined before enrichment runs.
  aiImportance?: number | null;
  now?: Date;
};

export type ScoringConfig = {
  halfLifeHours: number;
  keywords: string[]; // lowercased
  aiImportanceWeight: number;
};

export function defaultScoringConfig(): ScoringConfig {
  return {
    halfLifeHours: config.halfLifeHours,
    keywords: config.keywords,
    aiImportanceWeight: config.aiImportanceWeight,
  };
}

/**
 * score = (trustedSource + boundedSignal + keywordBoost) × decay
 *         + sourceWeight × 0.1
 *
 * - decay: exponential, half-life SCORING_HALFLIFE_HOURS (default 24h)
 * - signalBoost: bounded, source-aware engagement hint. HN/Reddit-style
 *   karma is deliberately tiny so popularity cannot outrank source trust.
 * - keywordBoost: +0.4 per keyword hit, capped at 2.0
 * - importanceBoost: aiImportance × AI_IMPORTANCE_WEIGHT — 0 until the article
 *   has been enriched; enrichment recomputes and writes the score back.
 *
 * Recomputed on every upsert, so refreshed signals re-rank existing articles.
 */
export function computeScore(args: ScoreInput, cfg: ScoringConfig = defaultScoringConfig()): number {
  const now = args.now ?? new Date();
  const ageH = Math.max(0, (now.getTime() - args.publishedAt.getTime()) / 3_600_000);

  const decay = Math.pow(0.5, ageH / cfg.halfLifeHours);

  const s = args.signals ?? {};
  const communitySource = /^(hn-frontpage|reddit-)/.test(args.sourceSlug ?? "");
  const signalVal =
    (s.points ?? 0) * (communitySource ? 0.02 : 0.1) +
    (s.comments ?? 0) * (communitySource ? 0.01 : 0.05) +
    (s.stars ?? 0) * (communitySource ? 0.02 : 0.08) +
    Math.min(s.downloads ?? 0, 100_000) * (communitySource ? 0.0005 : 0.001);
  // Community karma is a weak freshness hint, never a substitute for source
  // trust. Keep its contribution below the gap to the lowest trusted paper.
  const signalBoost = Math.log1p(Math.min(25, Math.max(0, signalVal))) * (communitySource ? 0.03 : 0.15);

  const text = `${args.title} ${args.summary ?? ""}`.toLowerCase();
  let kw = 0;
  for (const k of cfg.keywords) {
    if (text.includes(k)) kw += 0.4;
  }
  kw = Math.min(kw, 2.0);

  const importanceBoost = clamp01(args.aiImportance ?? 0) * cfg.aiImportanceWeight;

  const base = args.sourceWeight;
  const trustedSource = base * (1 + importanceBoost);
  const keywordBoost = communitySource ? Math.min(0.1, kw * 0.05) : kw;
  return (trustedSource + signalBoost + keywordBoost) * decay + base * 0.1;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
