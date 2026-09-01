import { getFeedArticles } from "@/lib/queries";
import { SITE } from "@/lib/constants";
import { feedContentHtml, feedQueryString, parseFeedQuery, pickFeedSummary } from "@/lib/feed";
import { safeShareableHttpUrl } from "@/lib/safe-url";

export const revalidate = 600;

export async function GET(req: Request) {
  const q = parseFeedQuery(new URL(req.url).searchParams);
  let articles: Awaited<ReturnType<typeof getFeedArticles>>;
  try {
    articles = await getFeedArticles(
      { category: q.category, minImportance: q.minImportance },
      50,
    );
  } catch (error) {
    console.warn("[feed.json] database unavailable:", error instanceof Error ? error.message : error);
    return new Response(JSON.stringify({ ok: false, reason: "database-unavailable" }), {
      status: 503,
      headers: {
        "content-type": "application/feed+json; charset=utf-8",
        "cache-control": "no-store",
        "retry-after": "30",
      },
    });
  }

  const qs = feedQueryString(q);
  const feed = {
    version: "https://jsonfeed.org/version/1.1",
    title: SITE.name,
    home_page_url: SITE.url,
    feed_url: `${SITE.url}/feed.json${qs}`,
    description: SITE.tagline_zh,
    language: q.lang === "en" ? "en" : "zh",
    items: articles.map((a) => {
      const summary = pickFeedSummary(a, q.lang);
      const reader = `${SITE.url}/a/${a.id}`;
       const external = safeShareableHttpUrl(a.url);
      return {
        id: reader,
        url: reader,
        ...(external ? { external_url: external } : {}),
        title: a.title,
        summary,
        content_html: feedContentHtml(a, q.lang),
        date_published: a.publishedAt.toISOString(),
        tags: a.aiTopics.filter(Boolean),
        authors: [{ name: a.source.name, url: `${SITE.url}/source/${a.source.slug}` }],
      };
    }),
  };

  return new Response(JSON.stringify(feed), {
    headers: { "content-type": "application/feed+json; charset=utf-8" },
  });
}
