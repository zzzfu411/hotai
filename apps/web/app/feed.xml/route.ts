import { getFeedArticles } from "@/lib/queries";
import { SITE } from "@/lib/constants";
import {
  escXml,
  feedContentHtml,
  feedQueryString,
  parseFeedQuery,
  pickFeedSummary,
} from "@/lib/feed";

export const revalidate = 600;

export async function GET(req: Request) {
  const q = parseFeedQuery(new URL(req.url).searchParams);
  const articles = await getFeedArticles(
    { category: q.category, minImportance: q.minImportance },
    50,
  );

  const items = articles
    .map((a) => {
      const description = pickFeedSummary(a, q.lang);
      const encoded = feedContentHtml(a, q.lang);
      const extra: string[] = [];
      if (description) extra.push(`      <description>${escXml(description)}</description>`);
      for (const t of a.aiTopics) {
        if (t) extra.push(`      <category>${escXml(t)}</category>`);
      }
      if (encoded) extra.push(`      <content:encoded><![CDATA[${encoded}]]></content:encoded>`);
      return `
    <item>
      <title>${escXml(a.title)}</title>
      <link>${escXml(a.url)}</link>
      <guid isPermaLink="true">${escXml(a.url)}</guid>
      <pubDate>${a.publishedAt.toUTCString()}</pubDate>
      <source>${escXml(a.source.name)}</source>
${extra.join("\n")}
    </item>`;
    })
    .join("");

  const self = `${SITE.url}/feed.xml${feedQueryString(q)}`;
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${escXml(SITE.name)}</title>
    <link>${escXml(SITE.url)}</link>
    <atom:link href="${escXml(self)}" rel="self" type="application/rss+xml"/>
    <description>${escXml(SITE.tagline_zh)}</description>
    <language>${q.lang === "en" ? "en" : "zh-CN"}</language>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
