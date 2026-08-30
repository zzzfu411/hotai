import { AI_ENABLED, type DigestBullet } from "@hotai/ai";
import { AskBox } from "@/components/AskBox";
import { DigestHeader } from "@/components/DigestHeader";
import { FeedList } from "@/components/FeedList";
import { toCard } from "@/lib/article";
import { loadDigest } from "@/lib/digest";
import { getArticlesSince, startOfUtcDay } from "@/lib/queries";
import type { Metadata } from "next";

// AI credentials are runtime-only secrets. Rendering this page dynamically
// prevents a build-time AI_DISABLED value from being baked into static HTML.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "今日简报",
  description: "今日 AI 要闻简报，附 Ask 问答。",
};

export default async function DigestPage() {
  let digest: Awaited<ReturnType<typeof loadDigest>> = null;
  let todaysTop: Awaited<ReturnType<typeof getArticlesSince>> = [];
  try {
    [digest, todaysTop] = await Promise.all([
      loadDigest(),
      getArticlesSince(startOfUtcDay(), 20),
    ]);
  } catch (err) {
    console.warn("[digest] db unavailable:", err instanceof Error ? err.message : err);
  }

  return (
    <div className="kz-page">
      <DigestHeader digest={digest} aiEnabled={AI_ENABLED} />

      {digest && (
        <ol className="kz-digest-bullets">
          {digest.bullets.map((b: DigestBullet, i: number) => (
            <li key={i} className="kz-card kz-digest-item">
              <div className="kz-digest-num">{String(i + 1).padStart(2, "0")}</div>
              <div>
                <h3>{b.title}</h3>
                <p>{b.takeaway}</p>
                {b.urls?.length > 0 && (
                  <div className="kz-digest-hosts">
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
                          className="kz-chip"
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

      <section className="kz-digest-hot">
        <FeedList
          articles={todaysTop.map(toCard)}
          ranked
          titleAs="h2"
          titleZh="今日最热"
          titleEn="Today's hottest"
        />
      </section>

      {AI_ENABLED && (
        <section className="kz-digest-ask">
          <AskBox />
        </section>
      )}
    </div>
  );
}
