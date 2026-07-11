import type { Source } from "@hotai/db";
import type { RawItem } from "../types.js";
import { httpJson } from "../http.js";

type HFModel = {
  id: string;
  modelId?: string;
  likes?: number;
  downloads?: number;
  lastModified?: string;
  createdAt?: string;
  pipeline_tag?: string;
  tags?: string[];
};

export async function fetchHuggingFaceTrending(source: Source): Promise<RawItem[]> {
  const models = await httpJson<HFModel[]>(source.url);
  const now = Date.now();
  // "Trending now" snapshot — we don't want lastModified=2022 to tank the time-decay score.
  // Clamp publishedAt to "now" when the model's lastModified is older than 30 days.
  const STALE_MS = 30 * 24 * 3600 * 1000;
  return models.map((m) => {
    const id = m.modelId ?? m.id;
    const published = m.lastModified ?? m.createdAt;
    const rawDate = published ? new Date(published) : new Date();
    const publishedAt = now - rawDate.getTime() > STALE_MS ? new Date() : rawDate;
    return {
      url: `https://huggingface.co/${id}`,
      title: id,
      summary: m.pipeline_tag ? `Pipeline: ${m.pipeline_tag}` : null,
      publishedAt,
      tags: m.tags?.slice(0, 5) ?? [],
      signals: { stars: m.likes ?? 0, downloads: m.downloads ?? 0 },
      raw: m,
    };
  });
}

type HFDailyPaperEntry = {
  paper?: {
    id?: string;
    title?: string;
    summary?: string;
    upvotes?: number;
    publishedAt?: string;
  };
  title?: string;
  publishedAt?: string;
};

const HF_DAILY_PAPERS_API = "https://huggingface.co/api/daily_papers?limit=50";

/**
 * Daily papers via the JSON API — unlike the HTML list page it includes the
 * abstract, which is what makes AI enrichment of papers actually useful.
 * Falls back to the canonical API URL when the seeded source still points at
 * the old HTML page.
 */
export async function fetchHuggingFacePapers(source: Source): Promise<RawItem[]> {
  const apiUrl = source.url.includes("/api/daily_papers") ? source.url : HF_DAILY_PAPERS_API;
  const entries = await httpJson<HFDailyPaperEntry[]>(apiUrl);
  const items: RawItem[] = [];
  for (const entry of entries) {
    const paper = entry.paper;
    if (!paper?.id) continue;
    const title = (paper.title ?? entry.title ?? "").trim();
    if (!title) continue;
    const published = entry.publishedAt ?? paper.publishedAt;
    items.push({
      url: `https://huggingface.co/papers/${paper.id}`,
      title,
      summary: paper.summary ? truncate(paper.summary.replace(/\s+/g, " ").trim(), 500) : null,
      publishedAt: published ? new Date(published) : new Date(),
      tags: ["paper"],
      signals: { points: paper.upvotes ?? 0 },
    });
  }
  return items;
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
