/**
 * Display-time cleanup for feed text. Upstream feeds carry boilerplate that
 * reads as noise on a card (Hacker News link/points footers, Google News
 * "Title - Publisher" suffixes and related-headline digests). Storage keeps the
 * raw text; these helpers only shape what a reader sees.
 */

const HN_FOOTER = /\bComments URL:\s*\S+/i;

function comparable(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

/** Strip feed boilerplate; returns "" when nothing readable remains. */
export function cleanSummary(summary: string | null | undefined, title = ""): string {
  if (!summary) return "";
  let text = summary;
  if (HN_FOOTER.test(text)) {
    text = text
      .replace(/\bArticle URL:\s*\S+/gi, " ")
      .replace(/\bComments URL:\s*\S+/gi, " ")
      .replace(/\bPoints:\s*\d+/gi, " ")
      .replace(/#\s*Comments:\s*\d+/gi, " ");
  }
  text = text.replace(/\s+/g, " ").trim();
  if (!text || /^https?:\/\/\S+$/i.test(text)) return "";
  const body = comparable(text);
  if (!body || body === comparable(title)) return "";
  return text;
}

/** Google News appends " - Publisher" to every headline. */
const PUBLISHER_SUFFIX = /^(.*\S)\s+[-–—]\s+([^-–—]{1,32})$/;

export type DisplayStory = {
  title: string;
  summary: string;
  /** Original publisher when the feed is an aggregator (Google News). */
  publisher: string | null;
};

export function displayStory(story: { title: string; summary?: string | null; sourceId?: string }): DisplayStory {
  const aggregator = story.sourceId?.startsWith("gnews-") ?? false;
  if (aggregator) {
    const match = PUBLISHER_SUFFIX.exec(story.title.trim());
    // Aggregator summaries are a list of related headlines, not a précis.
    if (match) return { title: match[1]!, summary: "", publisher: match[2]!.trim() };
    return { title: story.title, summary: "", publisher: null };
  }
  return { title: story.title, summary: cleanSummary(story.summary, story.title), publisher: null };
}
