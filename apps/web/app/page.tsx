import { HotList } from "@/components/HotList";
import { Hero } from "@/components/Hero";
import { CATEGORIES } from "@/lib/constants";
import { toCard } from "@/lib/article";
import { getHomeStats, getTopArticles } from "@/lib/queries";
import Link from "next/link";

export const revalidate = 600; // 10 min ISR

export default async function HomePage() {
  const [rows, stats] = await Promise.all([getTopArticles(50), getHomeStats()]);

  const articles = rows.map(toCard);
  const lastFetchStr = stats.lastFetch
    ? new Intl.DateTimeFormat("en-US", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "UTC" })
        .format(stats.lastFetch) + " UTC"
    : "—";

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <Hero
        stats={[
          { label_en: "Live sources", label_zh: "活跃来源", value: stats.enabledSources },
          { label_en: "Articles · 24h", label_zh: "24 小时入库", value: stats.articles24h },
          { label_en: "On the board", label_zh: "上榜文章", value: articles.length },
          { label_en: "Last fetch", label_zh: "最近抓取", value: lastFetchStr },
        ]}
      />

      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        {CATEGORIES.map((c) => (
          <Link
            key={c.slug}
            href={`/category/${c.slug}`}
            className="px-3 py-1.5 rounded-full border border-ink-200 dark:border-ink-800 hover:border-accent hover:text-accent transition font-medium"
          >
            #{c.label_en}
          </Link>
        ))}
      </div>

      <section className="mt-6 card-surface px-4 sm:px-6 py-2 sm:py-3">
        <HotList articles={articles} />
      </section>
    </div>
  );
}
