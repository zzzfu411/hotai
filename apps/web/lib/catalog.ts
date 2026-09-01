/**
 * Optional reading catalog for custom OPML-style subscriptions.
 * Fetched live through /api/catalog/pull — never written to Article.
 * Public RSS/Atom/JSON Feed only (no site-specific scrapers).
 */

export type CatalogGroup = "cn" | "intl" | "tech" | "ai" | "biz" | "science" | "fun";

export type CatalogCategoryId =
  | "mix"
  | "hot"
  | "tech"
  | "biz"
  | "intl"
  | "science"
  | "ai"
  | "ent"
  | "sports";

export type CatalogSource = {
  id: string;
  name: string;
  url: string;
  siteUrl?: string;
  group: CatalogGroup;
  /** Default-on for 综合 / mix. */
  enabled: boolean;
};

export type CatalogCategory = {
  id: CatalogCategoryId;
  labelZh: string;
  labelEn: string;
  /** Empty = follow the user's enabled list (综合). */
  sourceIds: string[];
};

const GNEWS = "https://news.google.com/rss";
const GNEWS_ZH = "hl=zh-CN&gl=CN&ceid=CN:zh-Hans";
const topic = (slug: string) => `${GNEWS}/headlines/section/topic/${slug}?${GNEWS_ZH}`;

export const CATALOG_SOURCES: readonly CatalogSource[] = [
  // —— 可选订阅目录（不构成首页 briefing corpus）——
  { id: "gnews-top", name: "谷歌要闻", url: `${GNEWS}?${GNEWS_ZH}`, siteUrl: "https://news.google.com", group: "cn", enabled: false },
  { id: "gnews-world", name: "国际", url: topic("WORLD"), siteUrl: "https://news.google.com", group: "intl", enabled: false },
  { id: "gnews-tech", name: "科技", url: topic("TECHNOLOGY"), siteUrl: "https://news.google.com", group: "tech", enabled: false },
  { id: "gnews-biz", name: "商业", url: topic("BUSINESS"), siteUrl: "https://news.google.com", group: "biz", enabled: false },
  { id: "bbc-zh", name: "BBC 中文", url: "https://feeds.bbci.co.uk/zhongwen/simp/rss.xml", siteUrl: "https://www.bbc.com/zhongwen/simp", group: "intl", enabled: false },
  { id: "dw-zh", name: "德国之声", url: "https://rss.dw.com/rdf/rss-chi-news", siteUrl: "https://www.dw.com/zh", group: "intl", enabled: false },
  { id: "rfi-zh", name: "法广", url: "https://www.rfi.fr/cn/rss", siteUrl: "https://www.rfi.fr/cn/", group: "intl", enabled: false },
  { id: "sspai", name: "少数派", url: "https://sspai.com/feed", siteUrl: "https://sspai.com", group: "tech", enabled: false },
  { id: "ithome", name: "IT之家", url: "https://www.ithome.com/rss/", siteUrl: "https://www.ithome.com", group: "tech", enabled: false },
  { id: "kr36", name: "36氪", url: "https://36kr.com/feed", siteUrl: "https://36kr.com", group: "biz", enabled: false },
  { id: "ifanr", name: "爱范儿", url: "https://www.ifanr.com/feed", siteUrl: "https://www.ifanr.com", group: "tech", enabled: false },
  { id: "geekpark", name: "极客公园", url: "https://www.geekpark.net/rss", siteUrl: "https://www.geekpark.net", group: "tech", enabled: false },
  { id: "solidot", name: "Solidot", url: "https://www.solidot.org/index.rss", siteUrl: "https://www.solidot.org", group: "tech", enabled: false },
  { id: "qbitai", name: "量子位", url: "https://www.qbitai.com/feed", siteUrl: "https://www.qbitai.com", group: "ai", enabled: false },
  { id: "jiqizhixin", name: "机器之心", url: "https://www.jiqizhixin.com/rss", siteUrl: "https://www.jiqizhixin.com", group: "ai", enabled: false },
  { id: "hn", name: "Hacker News", url: "https://hnrss.org/frontpage?points=50", siteUrl: "https://news.ycombinator.com", group: "tech", enabled: false },
  { id: "theverge", name: "The Verge", url: "https://www.theverge.com/rss/index.xml", siteUrl: "https://www.theverge.com", group: "tech", enabled: false },
  { id: "arstechnica", name: "Ars Technica", url: "https://feeds.arstechnica.com/arstechnica/index", siteUrl: "https://arstechnica.com", group: "tech", enabled: false },
  { id: "wired", name: "Wired", url: "https://www.wired.com/feed/rss", siteUrl: "https://www.wired.com", group: "tech", enabled: false },
  { id: "techcrunch", name: "TechCrunch", url: "https://techcrunch.com/feed/", siteUrl: "https://techcrunch.com", group: "tech", enabled: false },
  { id: "mittr", name: "MIT TR", url: "https://www.technologyreview.com/feed/", siteUrl: "https://www.technologyreview.com", group: "science", enabled: false },
  { id: "quanta", name: "Quanta", url: "https://www.quantamagazine.org/feed", siteUrl: "https://www.quantamagazine.org", group: "science", enabled: false },
  { id: "npr", name: "NPR", url: "https://feeds.npr.org/1001/rss.xml", siteUrl: "https://www.npr.org", group: "intl", enabled: false },
  { id: "guardian", name: "Guardian", url: "https://www.theguardian.com/world/rss", siteUrl: "https://www.theguardian.com/world", group: "intl", enabled: false },
  { id: "openai-news", name: "OpenAI", url: "https://openai.com/news/rss.xml", siteUrl: "https://openai.com/news", group: "ai", enabled: true },
  { id: "hf-blog", name: "Hugging Face", url: "https://huggingface.co/blog/feed.xml", siteUrl: "https://huggingface.co/blog", group: "ai", enabled: true },
  { id: "simonw", name: "Simon Willison", url: "https://simonwillison.net/atom/everything/", siteUrl: "https://simonwillison.net", group: "ai", enabled: false },
  { id: "hotai-feed", name: "Hot AI Briefing", url: "/feed.json", siteUrl: "/", group: "ai", enabled: true },
  { id: "juya-daily", name: "橘鸦早报", url: "https://daily.juya.uk/rss.xml", siteUrl: "https://daily.juya.uk/", group: "ai", enabled: true },
  { id: "gnews-ent", name: "娱乐", url: topic("ENTERTAINMENT"), siteUrl: "https://news.google.com", group: "fun", enabled: false },
  { id: "gnews-sports", name: "体育", url: topic("SPORTS"), siteUrl: "https://news.google.com", group: "fun", enabled: false },
  { id: "gnews-sci", name: "科学", url: topic("SCIENCE"), siteUrl: "https://news.google.com", group: "science", enabled: false },
  { id: "gnews-health", name: "健康", url: topic("HEALTH"), siteUrl: "https://news.google.com", group: "science", enabled: false },
  { id: "bbc-tech", name: "BBC Tech", url: "https://feeds.bbci.co.uk/news/technology/rss.xml", siteUrl: "https://www.bbc.com/news/technology", group: "tech", enabled: false },
  { id: "bbc-biz", name: "BBC Business", url: "https://feeds.bbci.co.uk/news/business/rss.xml", siteUrl: "https://www.bbc.com/news/business", group: "biz", enabled: false },
  { id: "lobsters", name: "Lobsters", url: "https://lobste.rs/rss", siteUrl: "https://lobste.rs", group: "tech", enabled: false },
];

export const CATALOG_BY_ID: ReadonlyMap<string, CatalogSource> = new Map(
  CATALOG_SOURCES.map((s) => [s.id, s]),
);

export const CATALOG_CATEGORIES: readonly CatalogCategory[] = [
  { id: "mix", labelZh: "综合", labelEn: "Mix", sourceIds: [] },
  {
    id: "hot",
    labelZh: "要闻",
    labelEn: "Headlines",
    sourceIds: ["gnews-top", "bbc-zh", "dw-zh", "ithome", "kr36"],
  },
  {
    id: "tech",
    labelZh: "科技",
    labelEn: "Tech",
    sourceIds: ["gnews-tech", "sspai", "ithome", "ifanr", "solidot", "hn", "theverge", "arstechnica", "techcrunch", "bbc-tech"],
  },
  {
    id: "biz",
    labelZh: "商业",
    labelEn: "Business",
    sourceIds: ["gnews-biz", "kr36", "bbc-biz", "theverge"],
  },
  {
    id: "intl",
    labelZh: "国际",
    labelEn: "World",
    sourceIds: ["gnews-world", "bbc-zh", "dw-zh", "rfi-zh", "guardian", "npr"],
  },
  {
    id: "science",
    labelZh: "科学",
    labelEn: "Science",
    sourceIds: ["gnews-sci", "gnews-health", "mittr", "quanta", "solidot"],
  },
  {
    id: "ai",
    labelZh: "AI",
    labelEn: "AI",
    sourceIds: ["qbitai", "jiqizhixin", "juya-daily", "openai-news", "hf-blog", "simonw", "hn", "hotai-feed"],
  },
  {
    id: "ent",
    labelZh: "娱乐",
    labelEn: "Fun",
    sourceIds: ["gnews-ent"],
  },
  {
    id: "sports",
    labelZh: "体育",
    labelEn: "Sports",
    sourceIds: ["gnews-sports"],
  },
];

export const DEFAULT_ENABLED_IDS: readonly string[] = CATALOG_SOURCES.filter((s) => s.enabled).map(
  (s) => s.id,
);

export const MAX_PULL_IDS = 20;
export const CATALOG_CONCURRENCY = 6;
/** Timeline cards per source — enough for mix/waterfall without a 1.5k-item JSON blob. */
export const CATALOG_ITEMS_PER_SOURCE = 24;
export const CATALOG_SUMMARY_LEN = 180;

export function isCatalogCategoryId(raw: string | null | undefined): raw is CatalogCategoryId {
  return CATALOG_CATEGORIES.some((c) => c.id === raw);
}

export function getCatalogCategory(id: CatalogCategoryId): CatalogCategory {
  return CATALOG_CATEGORIES.find((c) => c.id === id) ?? CATALOG_CATEGORIES[0]!;
}

export function defaultEnabledIds(): string[] {
  return [...DEFAULT_ENABLED_IDS];
}

/** Keep only ids that exist in the catalog, unique, cap at MAX_PULL_IDS. */
export function resolveCatalogSources(ids: string[]): CatalogSource[] {
  const out: CatalogSource[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) continue;
    const src = CATALOG_BY_ID.get(id);
    if (!src) continue;
    seen.add(id);
    out.push(src);
    if (out.length >= MAX_PULL_IDS) break;
  }
  return out;
}

export function idsForCategory(
  categoryId: CatalogCategoryId,
  enabledIds: string[],
): string[] {
  const cat = getCatalogCategory(categoryId);
  if (cat.id === "mix" || cat.sourceIds.length === 0) {
    return resolveCatalogSources(enabledIds).map((s) => s.id);
  }
  const enabled = new Set(enabledIds);
  const preferred = cat.sourceIds.filter((id) => enabled.has(id) && CATALOG_BY_ID.has(id));
  const rest = cat.sourceIds.filter((id) => CATALOG_BY_ID.has(id) && !enabled.has(id));
  // Topic chips may still show an explicitly chosen source even when it is
  // absent from the small private default set.
  return resolveCatalogSources([...preferred, ...rest]).map((s) => s.id);
}
