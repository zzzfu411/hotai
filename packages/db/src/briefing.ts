/**
 * Sources that make up Ria's private AI briefing corpus.
 *
 * Keep this list deliberately small: the seed uses it to set Source.enabled,
 * while web queries use it to prevent retained rows from disabled/legacy
 * sources (for example Hacker News) leaking into the briefing.
 *
 * Default ON: HF Daily Papers, arXiv cs.LG/AI, OpenAI / Hugging Face / 橘鸦,
 * plus lab changelog feeds that already exist in seed.
 */
export const BRIEFING_SOURCE_SLUGS = [
  "huggingface-papers",
  "arxiv-cs-lg",
  "arxiv-cs-ai",
  "openai-blog",
  "huggingface-blog",
  "juya-daily",
  "anthropic-news",
  "google-research",
  "deepmind-blog",
  "meta-ai",
] as const;

export type BriefingSourceSlug = (typeof BRIEFING_SOURCE_SLUGS)[number];

export const BRIEFING_SOURCE_SLUG_SET: ReadonlySet<string> = new Set(BRIEFING_SOURCE_SLUGS);

export function isBriefingSourceSlug(slug: string): slug is BriefingSourceSlug {
  return BRIEFING_SOURCE_SLUG_SET.has(slug);
}
