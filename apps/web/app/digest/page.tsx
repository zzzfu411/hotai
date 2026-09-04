import { AI_ENABLED, type DigestBullet } from "@hotai/ai";
import { AskBox } from "@/components/AskBox";
import { DigestHeader } from "@/components/DigestHeader";
import { FeedList } from "@/components/FeedList";
import { toCard } from "@/lib/article";
import { linkDigestBullets, loadDigest } from "@/lib/digest";
import { getArticlesSince, startOfUtcDay } from "@/lib/queries";
import { safeHttpUrl } from "@/lib/safe-url";
import type { Metadata } from "next";
import Link from "next/link";

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
  let dbUnavailable = false;
  try {
    [digest, todaysTop] = await Promise.all([
      loadDigest(),
      getArticlesSince(startOfUtcDay(), 20),
    ]);
  } catch (err) {
    dbUnavailable = true;
    console.warn("[digest] db unavailable:", err instanceof Error ? err.message : err);
  }

  return (
    <div className="ha-page">
      <DigestHeader digest={digest} aiEnabled={AI_ENABLED} />

      {digest && (
        <ol className="ha-digest-bullets">
          {linkDigestBullets(digest.bullets, todaysTop).map((b: DigestBullet, i: number) => (
            <li key={i} className="ha-card ha-digest-item">
              <div className="ha-digest-num">{String(i + 1).padStart(2, "0")}</div>
              <div>
                <h3>{b.title}</h3>
                <p>{b.takeaway}</p>
                {(b.articleIds?.length || b.urls?.length) ? (
                  <div className="ha-digest-hosts">
                    {b.articleIds?.map((id) => (
                      <Link key={`article-${id}`} href={`/a/${id}`} className="ha-chip">
                        站内阅读 · Read on Hot AI
                      </Link>
                    ))}
                    {b.urls.map((u) => {
                      const safe = safeHttpUrl(u);
                      if (!safe) return null;
                      let host = "";
                      try {
                        host = new URL(safe).hostname.replace(/^www\./, "");
                      } catch {
                        host = safe;
                      }
                      return (
                        <a
                          key={safe}
                          href={safe}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ha-chip"
                        >
                          {host} ↗
                        </a>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            </li>
          ))}
        </ol>
      )}

      <section className="ha-digest-hot">
        <FeedList
          articles={todaysTop.map(toCard)}
          ranked
          titleAs="h2"
          titleZh="今日最热"
          titleEn="Today's hottest"
          emptyTitleZh={dbUnavailable ? "入库热榜暂时不可用" : undefined}
          emptyTitleEn={dbUnavailable ? "Stored hot list unavailable" : undefined}
          emptyCopyZh={dbUnavailable ? "数据库连接失败；首页 briefing 稍后再试。" : undefined}
          emptyCopyEn={dbUnavailable ? "The database is unavailable; try the briefing again later." : undefined}
        />
      </section>

      {AI_ENABLED && (
        <section className="ha-digest-ask">
          <AskBox />
        </section>
      )}
    </div>
  );
}
