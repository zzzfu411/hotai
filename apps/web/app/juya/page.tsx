import Link from "next/link";
import type { Metadata } from "next";
import {
  JUYA_HOME,
  JUYA_VIDEO_BILI,
  JUYA_VIDEO_YT,
  loadJuyaIssues,
  pickJuyaIssue,
} from "@/lib/juya";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const metadata: Metadata = {
  title: "橘鸦早报",
  description: "橘鸦 Juya 的每日 AI 早报，在 Hot AI 里阅读。",
};

type PageProps = { searchParams: Promise<{ date?: string }> };

export default async function JuyaPage({ searchParams }: PageProps) {
  const { date } = await searchParams;
  let issues: Awaited<ReturnType<typeof loadJuyaIssues>> = [];
  let error: string | null = null;
  try {
    issues = await loadJuyaIssues();
  } catch {
    error = "橘鸦 RSS 暂时拉不到。源站是 daily.juya.uk，可稍后再试。";
  }

  const issue = pickJuyaIssue(issues, date);
  const archive = issues.slice(0, 30);

  return (
    <div className="ha-juya">
      <header className="ha-card ha-juya-head">
        <p className="ha-page-kicker">橘鸦 Juya · 外部早报</p>
        <h1 className="ha-page-title">{issue ? issue.title : "橘鸦 AI 早报"}</h1>
        <p className="ha-page-lede">
          内容来自
          <a href={JUYA_HOME} target="_blank" rel="noopener noreferrer">
            daily.juya.uk
          </a>
          ，Hot AI 只做阅读壳，不改写、不入库。
        </p>
        <div className="ha-digest-hosts">
          <a className="ha-chip" href={JUYA_HOME} target="_blank" rel="noopener noreferrer">
            原文站 ↗
          </a>
          <a className="ha-chip" href={JUYA_VIDEO_BILI} target="_blank" rel="noopener noreferrer">
            B 站 ↗
          </a>
          <a className="ha-chip" href={JUYA_VIDEO_YT} target="_blank" rel="noopener noreferrer">
            YouTube ↗
          </a>
        </div>
      </header>

      {error ? (
        <div className="ha-card ha-feed-empty">
          <p className="font-bold">加载失败</p>
          <p>{error}</p>
        </div>
      ) : null}

      {archive.length > 1 ? (
        <nav className="ha-juya-dates" aria-label="往期早报">
          {archive.map((it) => (
            <Link
              key={it.date}
              href={`/juya?date=${it.date}`}
              className={issue?.date === it.date ? "ha-chip ha-chip-accent" : "ha-chip"}
            >
              {it.date.slice(5)}
            </Link>
          ))}
        </nav>
      ) : null}

      {issue ? (
        <article className="ha-card ha-juya-paper">
          {issue.toc.length > 2 ? (
            <details className="ha-juya-toc">
              <summary>目录</summary>
              <ol>
                {issue.toc.map((t) => (
                  <li key={t.id} className={t.level === 3 ? "ha-juya-toc-sub" : undefined}>
                    <a href={`#${t.id}`}>{t.text}</a>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
          <div className="reader-prose ha-juya-prose" dangerouslySetInnerHTML={{ __html: issue.html }} />
        </article>
      ) : !error ? (
        <div className="ha-card ha-feed-empty">
          <p className="font-bold">还没有早报</p>
          <p>RSS 里暂时没有带日期的条目。</p>
        </div>
      ) : null}
    </div>
  );
}
