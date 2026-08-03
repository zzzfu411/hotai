import type { MetadataRoute } from "next";
import { getEnabledSourceSlugs } from "@/lib/queries";
import { CATEGORIES, SITE } from "@/lib/constants";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = SITE.url;
  const sources = await getEnabledSourceSlugs();
  const now = new Date();
  return [
    { url: `${base}/`, lastModified: now, changeFrequency: "hourly", priority: 1 },
    { url: `${base}/digest`, lastModified: now, changeFrequency: "hourly", priority: 0.9 },
    { url: `${base}/blogs`, lastModified: now, changeFrequency: "weekly", priority: 0.85 },
    { url: `${base}/search`, lastModified: now, changeFrequency: "weekly", priority: 0.3 },
    ...CATEGORIES.map((c) => ({
      url: `${base}/category/${c.slug}`,
      lastModified: now,
      changeFrequency: "hourly" as const,
      priority: 0.8,
    })),
    ...sources.map((s) => ({
      url: `${base}/source/${s.slug}`,
      lastModified: now,
      changeFrequency: "daily" as const,
      priority: 0.5,
    })),
  ];
}
