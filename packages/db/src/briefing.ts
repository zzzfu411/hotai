/**
 * Sources that make up Ria's private AI briefing corpus.
 *
 * Keep this list deliberately small: seed, fetcher, and ranked reads all
 * treat it as the corpus. Flipping Source.enabled in the database is not
 * enough — leftover HN rows stay out until the slug is added here.
 *
 * Default ON: HF Daily Papers, arXiv cs.LG/AI, OpenAI / Hugging Face / 橘鸦
 * changelogs. Everything else stays in seed but enabled=false.
 */
export const BRIEFING_SOURCE_SLUGS = [
  "huggingface-papers",
  "arxiv-cs-lg",
  "arxiv-cs-ai",
  "openai-blog",
  "huggingface-blog",
  "juya-daily",
] as const;

export type BriefingSourceSlug = (typeof BRIEFING_SOURCE_SLUGS)[number];

export const BRIEFING_SOURCE_SLUG_SET: ReadonlySet<string> = new Set(BRIEFING_SOURCE_SLUGS);

export function isBriefingSourceSlug(slug: string): slug is BriefingSourceSlug {
  return BRIEFING_SOURCE_SLUG_SET.has(slug);
}
