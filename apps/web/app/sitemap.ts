import type { MetadataRoute } from "next";
import { getEnabledSourceSlugs } from "@/lib/queries";
import { CATEGORIES, SITE } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE.url;
  const sources = await getEnabledSourceSlugs().catch((error) => {
    console.warn("[sitemap] database unavailable:", error instanceof Error ? error.message : error);
    return [];
  });
  return [
    { url: `${base}/`, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/hot`, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/digest`, changeFrequency: "hourly", priority: 0.85 },
    { url: `${base}/juya`, changeFrequency: "daily", priority: 0.8 },
    { url: `${base}/blogs`, changeFrequency: "weekly", priority: 0.85 },
    ...CATEGORIES.map((c) => ({
      url: `${base}/category/${c.slug}`,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    ...sources.map((s) => ({
      url: `${base}/source/${s.slug}`,
      changeFrequency: "daily" as const,
      priority: 0.5,
    })),
  ];
}
