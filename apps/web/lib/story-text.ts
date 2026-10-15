/**
 * Display-time cleanup for feed text. Upstream feeds carry boilerplate that
 * reads as noise on a card (Hacker News link/points footers, Google News
 * "Title - Publisher" suffixes and related-headline digests). Storage keeps the
 * raw text; these helpers only shape what a reader sees.
 */

/** "…查看全文", "Continue reading »", "[…]"; a plain truncation "…" stays. */
const READ_MORE_TAIL =
  /\s*(?:(?:\.{2,}|…)\s*)?(?:查看全文|阅读全文|阅读原文|点击查看|read more|continue reading)\s*[»›>→]*\s*$|\s*\[(?:\.{3}|…)\]\s*$/i;

/** hnrss.org descriptions end in "Article URL: … Comments URL: … Points: …". */
const HN_FOOTER = /\b(?:Article|Comments) URL:\s*\S/i;

function comparable(text: string): string {
  return text.toLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

/** Strip feed boilerplate; returns "" when nothing readable remains. */
export function cleanSummary(summary: string | null | undefined, title = ""): string {
  if (!summary) return "";
  let text = summary;
  // Everything from the footer on is boilerplate, including a footer that a
  // length cap cut off mid-word ("… Comments URL: https://… P…").
  const footer = HN_FOOTER.exec(text);
  if (footer) text = text.slice(0, footer.index);
  text = text.replace(/\s+/g, " ").trim();
  if (!text || /^https?:\/\/\S+$/i.test(text)) return "";
  // A bare link trailing the prose ("See also: X - https://…") is unreadable
  // on a card; the story itself is one click away.
  text = text.replace(/\s*[-–—:]?\s*https?:\/\/\S+$/i, "").trim();
  // So is a "read more" tail; the card itself is the link.
  text = text.replace(READ_MORE_TAIL, "").trim();
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
