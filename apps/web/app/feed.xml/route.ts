import { prisma } from "@/lib/db";
import { SITE } from "@/lib/constants";

export const revalidate = 600;

function esc(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

export async function GET() {
  const articles = await prisma.article.findMany({
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take: 50,
    include: { source: { select: { name: true } } },
  });

  const items = articles
    .map(
      (a) => `
    <item>
      <title>${esc(a.title)}</title>
      <link>${esc(a.url)}</link>
      <guid isPermaLink="true">${esc(a.url)}</guid>
      <pubDate>${a.publishedAt.toUTCString()}</pubDate>
      <source>${esc(a.source.name)}</source>
      ${a.summary ? `<description>${esc(a.summary)}</description>` : ""}
    </item>`,
    )
    .join("");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>${esc(SITE.name)}</title>
    <link>${esc(SITE.url)}</link>
    <description>${esc(SITE.tagline_en)}</description>
    <lastBuildDate>${new Date().toUTCString()}</lastBuildDate>
    ${items}
  </channel>
</rss>`;

  return new Response(xml, {
    headers: { "content-type": "application/rss+xml; charset=utf-8" },
  });
}
