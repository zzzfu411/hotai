import { safeHttpUrl } from "./safe-url";

export type ReadableStory = {
  url: string;
  title: string;
  summary?: string | null;
  source?: string;
  sourceId?: string;
  articleId?: number;
};

/** Internal identity is explicit; remote URLs never decide a DB article ID. */
export function readerLink(story: ReadableStory): string {
  if (Number.isInteger(story.articleId) && story.articleId! > 0 && story.articleId! <= 2_147_483_647) {
    return `/a/${story.articleId}`;
  }
  if (story.sourceId === "juya-daily") {
    const date = /(\d{4}-\d{2}-\d{2})/.exec(story.title)?.[1];
    if (date) return `/juya?date=${date}`;
  }
  const url = safeHttpUrl(story.url);
  if (!url) return "/subscribe";
  const params = new URLSearchParams({ url, title: story.title.slice(0, 300) });
  if (story.summary) params.set("summary", story.summary.slice(0, 400));
  if (story.sourceId) params.set("src", story.sourceId);
  if (story.source) params.set("source", story.source.slice(0, 100));
  return `/r?${params}`;
}
