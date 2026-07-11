import { config } from "./config.js";

export type Signals = {
  points?: number;      // HN points, reddit upvotes, HF paper upvotes
  comments?: number;
  stars?: number;       // GitHub stars today, HF likes
  downloads?: number;   // HF downloads
};

export type ScoreInput = {
  sourceWeight: number;
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
 * score = (sourceWeight + signalBoost + keywordBoost + importanceBoost) × decay
 *         + sourceWeight × 0.1
 *
 * - decay: exponential, half-life SCORING_HALFLIFE_HOURS (default 24h)
 * - signalBoost: log-compressed engagement (points/comments/stars/downloads)
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
  const signalVal =
    (s.points ?? 0) +
    (s.comments ?? 0) * 0.5 +
    (s.stars ?? 0) * 0.8 +
    Math.min(s.downloads ?? 0, 100_000) * 0.01;
  const signalBoost = Math.log1p(Math.max(0, signalVal));

  const text = `${args.title} ${args.summary ?? ""}`.toLowerCase();
  let kw = 0;
  for (const k of cfg.keywords) {
    if (text.includes(k)) kw += 0.4;
  }
  kw = Math.min(kw, 2.0);

  const importanceBoost = clamp01(args.aiImportance ?? 0) * cfg.aiImportanceWeight;

  const base = args.sourceWeight;
  return (base + signalBoost + kw + importanceBoost) * decay + base * 0.1;
}

function clamp01(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(1, n));
}
