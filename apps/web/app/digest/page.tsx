import { AI_ENABLED, type DigestBullet } from "@hotai/ai";
import { HotList } from "@/components/HotList";
import { toCard } from "@/lib/article";
import { DigestHeader } from "@/components/DigestHeader";
import { AskBox } from "@/components/AskBox";
import { loadDigest } from "@/lib/digest";
import { getArticlesSince, startOfUtcDay } from "@/lib/queries";
import type { Metadata } from "next";

export const revalidate = 1800; // 30 min — first visitor of each window may trigger an on-demand generate

export const metadata: Metadata = {
  title: "Today's AI Brief",
  description: "AI-generated daily brief of the biggest stories in AI.",
};

export default async function DigestPage() {
  const [digest, todaysTop] = await Promise.all([
    loadDigest(),
    getArticlesSince(startOfUtcDay(), 20),
  ]);

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-6 sm:py-10">
      <DigestHeader digest={digest} aiEnabled={AI_ENABLED} />

      {digest && (
        <ol className="mt-8 space-y-4">
          {digest.bullets.map((b: DigestBullet, i: number) => (
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
