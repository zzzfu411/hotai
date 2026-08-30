import type { Metadata } from "next";
import { BlogDirectory } from "@/components/BlogDirectory";
import { BlogHero } from "@/components/BlogHero";
import { getCuratedBlogs } from "@/lib/queries";

// Curated list changes only on seed/deploy — long ISR is fine.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "精选博客",
  description: "AI 研究者与从业者高质量博客目录，含阅读指南。",
  openGraph: {
    title: "精选博客 · Hot AI",
    description: "编辑精选的研究员与从业者博客，含更新节奏与推荐入口。",
  },
};

function parseStartHere(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const o = item as Record<string, unknown>;
      if (typeof o.title !== "string" || !o.title.trim()) return null;
      return {
        title: o.title,
        url: typeof o.url === "string" ? o.url : undefined,
        noteEn: typeof o.noteEn === "string" ? o.noteEn : undefined,
        noteZh: typeof o.noteZh === "string" ? o.noteZh : undefined,
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);
}

export default async function BlogsPage() {
  const rows = await getCuratedBlogs();
  const blogs = rows.map((b) => ({
    slug: b.slug,
    name: b.name,
    author: b.author,
    url: b.url,
    feedUrl: b.feedUrl,
    affiliation: b.affiliation,
    bioEn: b.bioEn,
    bioZh: b.bioZh,
    tags: b.tags,
    lang: b.lang,
    featured: b.featured,
    guideCadenceEn: b.guideCadenceEn,
    guideCadenceZh: b.guideCadenceZh,
    guideHowEn: b.guideHowEn,
    guideHowZh: b.guideHowZh,
    guideTimelineEn: b.guideTimelineEn,
    guideTimelineZh: b.guideTimelineZh,
    guideStartHere: parseStartHere(b.guideStartHere),
  }));
  const featured = blogs.filter((b) => b.featured).length;

  return (
    <div className="kz-page kz-page-wide">
      <BlogHero total={blogs.length} featured={featured} />
      <BlogDirectory blogs={blogs} />
    </div>
  );
}
