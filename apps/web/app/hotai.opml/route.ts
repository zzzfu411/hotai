import { getCuratedBlogs, getEnabledSources } from "@/lib/queries";
import { SITE } from "@/lib/constants";
import { escXml } from "@/lib/feed";
import { safeShareableHttpUrl } from "@/lib/safe-url";

export const revalidate = 600;

const GROUPS: { key: string; title: string }[] = [
  { key: "industry", title: "Industry" },
  { key: "research", title: "Research" },
  { key: "media", title: "Media" },
  { key: "opensource", title: "Open Source" },
];

function outline(text: string, xmlUrl: string, htmlUrl: string): string {
  return `      <outline type="rss" text="${escXml(text)}" title="${escXml(text)}" xmlUrl="${escXml(xmlUrl)}" htmlUrl="${escXml(htmlUrl)}"/>`;
}

export async function GET() {
  const [sources, blogs] = await Promise.all([getEnabledSources(), getCuratedBlogs()]);

  const groups = GROUPS.map((g) => {
    const children = sources
      .filter((s) => s.category === g.key && s.type === "rss")
      .map((s) => {
        const xmlUrl = safeShareableHttpUrl(s.url);
        if (!xmlUrl) return "";
        const htmlUrl = safeShareableHttpUrl(s.homepage) ?? xmlUrl;
        return outline(s.name, xmlUrl, htmlUrl);
      })
      .filter(Boolean);
    if (children.length === 0) return "";
    return `    <outline text="${escXml(g.title)}" title="${escXml(g.title)}">
${children.join("\n")}
    </outline>`;
  }).filter(Boolean);

  const blogOutlines: string[] = [];
  for (const b of blogs) {
    const xmlUrl = b.feedUrl ? safeShareableHttpUrl(b.feedUrl) : null;
    const htmlUrl = safeShareableHttpUrl(b.url);
    if (!xmlUrl || !htmlUrl) continue;
    blogOutlines.push(outline(b.name, xmlUrl, htmlUrl));
  }

  if (blogOutlines.length) {
    groups.push(`    <outline text="Blogs" title="Blogs">
${blogOutlines.join("\n")}
    </outline>`);
  }

  const now = new Date().toUTCString();
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- 热榜 Feed 在 ${escXml(SITE.url)}/feed.xml 与 /feed.json；不要把它们和下面的实验室 RSS 挂进同一分类，否则条目会重复。 -->
<opml version="2.0">
  <head>
    <title>${escXml(SITE.name)}</title>
    <dateCreated>${escXml(now)}</dateCreated>
    <ownerName>${escXml(SITE.name)}</ownerName>
    <docs>${escXml(`${SITE.url}/hotai.opml`)}</docs>
  </head>
  <body>
${groups.join("\n")}
  </body>
</opml>`;

  return new Response(xml, {
    headers: { "content-type": "text/x-opml+xml; charset=utf-8" },
  });
}
