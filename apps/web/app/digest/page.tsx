import { prisma } from "@/lib/db";
import { AI_ENABLED, generateDigest, type DigestBullet } from "@hotai/ai";
import { HotList } from "@/components/HotList";
import { toCard } from "@/lib/article";
import { DigestHeader } from "@/components/DigestHeader";
import { AskBox } from "@/components/AskBox";
import type { Metadata } from "next";

export const revalidate = 1800; // 30 min — first visitor of each window may trigger an on-demand generate

export const metadata: Metadata = {
  title: "Today's AI Brief",
  description: "AI-generated daily brief of the biggest stories in AI.",
};

function startOfUtcDay(d: Date): Date {
  const x = new Date(d);
  x.setUTCHours(0, 0, 0, 0);
  return x;
}

type Loaded = {
  headline: string;
  overview: string;
  bullets: DigestBullet[];
  themes: string[];
  model?: string | null;
  createdAt: Date;
};

async function loadDigest(): Promise<Loaded | null> {
  const today = startOfUtcDay(new Date());
  const existing = await prisma.digest.findUnique({ where: { date: today } });
  if (existing) {
    return {
      headline: existing.headline,
      overview: existing.overview,
      bullets: (existing.bullets as unknown as DigestBullet[]) ?? [],
      themes: existing.themes,
      model: existing.model,
      createdAt: existing.createdAt,
    };
  }
  // None yet — try to build one on the fly if AI is configured.
  if (!AI_ENABLED) return null;
  const articles = await prisma.article.findMany({
    where: { publishedAt: { gte: today } },
    orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
    take: 40,
    include: { source: { select: { name: true } } },
  });
  if (articles.length < 5) return null;
  const result = await generateDigest(
    articles.map((a) => ({
      id: a.id,
      title: a.title,
      summaryEn: a.aiSummaryEn ?? a.summary ?? null,
      url: a.url,
      sourceName: a.source.name,
      score: a.score,
      topics: a.aiTopics,
    })),
  );
  if (!result) return null;
  const saved = await prisma.digest.upsert({
    where: { date: today },
    create: {
      date: today,
      headline: result.headline,
      overview: result.overview,
      bullets: result.bullets as unknown as object,
      themes: result.themes,
      model: result.model,
    },
    update: {
      headline: result.headline,
      overview: result.overview,
      bullets: result.bullets as unknown as object,
      themes: result.themes,
      model: result.model,
      createdAt: new Date(),
    },
  });
  return {
    headline: result.headline,
    overview: result.overview,
    bullets: result.bullets,
    themes: result.themes,
    model: result.model,
    createdAt: saved.createdAt,
  };
}

export default async function DigestPage() {
  const today = startOfUtcDay(new Date());
  const [digest, todaysTop] = await Promise.all([
    loadDigest(),
    prisma.article.findMany({
      where: { publishedAt: { gte: today } },
      orderBy: [{ score: "desc" }, { publishedAt: "desc" }],
      take: 20,
      include: { source: { select: { slug: true, name: true } } },
    }),
  ]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <DigestHeader digest={digest} aiEnabled={AI_ENABLED} />

      {digest && (
        <ol className="mt-8 space-y-4">
          {digest.bullets.map((b, i) => (
            <li
              key={i}
              className="card-surface p-5 sm:p-6 flex gap-4 hover:border-accent/60 transition animate-fade-up"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <div className="text-2xl font-black tabular-nums leading-none text-ember-500 w-10 shrink-0">
                {String(i + 1).padStart(2, "0")}
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-lg leading-snug">{b.title}</h3>
                <p className="mt-1.5 text-sm text-ink-600 dark:text-ink-300 leading-relaxed">
                  {b.takeaway}
                </p>
                {b.urls?.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {b.urls.map((u) => {
                      let host = "";
                      try {
                        host = new URL(u).hostname.replace(/^www\./, "");
                      } catch {
                        host = u;
                      }
                      return (
                        <a
                          key={u}
                          href={u}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="chip-soft hover:border-accent hover:text-accent transition"
                        >
                          {host} ↗
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      <section className="mt-10">
        <h2 className="text-sm uppercase tracking-widest font-semibold text-ink-500 dark:text-ink-400">
          Today&apos;s hottest
        </h2>
        <div className="mt-3 card-surface px-4 sm:px-6 py-2 sm:py-3">
          <HotList articles={todaysTop.map(toCard)} />
        </div>
      </section>

      {AI_ENABLED && (
        <section className="mt-10">
          <AskBox />
        </section>
      )}
    </div>
  );
}
