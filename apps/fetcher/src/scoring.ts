import { config } from "./config.js";

export type Signals = {
  points?: number;      // HN points, reddit upvotes
  comments?: number;
  stars?: number;       // GitHub stars today
  downloads?: number;   // HF downloads
};

export function computeScore(args: {
  sourceWeight: number;
  publishedAt: Date;
  title: string;
  summary?: string | null;
  signals?: Signals;
  now?: Date;
}): number {
  const now = args.now ?? new Date();
  const ageH = Math.max(0, (now.getTime() - args.publishedAt.getTime()) / 3_600_000);

  // time decay (exponential half-life)
  const decay = Math.pow(0.5, ageH / config.halfLifeHours);

  // signal boost (log-compressed)
  const s = args.signals ?? {};
  const signalVal =
    (s.points ?? 0) +
    (s.comments ?? 0) * 0.5 +
    (s.stars ?? 0) * 0.8 +
    Math.min(s.downloads ?? 0, 100_000) * 0.01;
  const signalBoost = Math.log1p(signalVal);

  // keyword boost
  const text = `${args.title} ${args.summary ?? ""}`.toLowerCase();
  let kw = 0;
  for (const k of config.keywords) {
    if (text.includes(k.toLowerCase())) kw += 0.4;
  }
  kw = Math.min(kw, 2.0);

  const base = args.sourceWeight;
  return (base + signalBoost + kw) * decay + base * 0.1;
}
