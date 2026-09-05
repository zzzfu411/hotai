import { serverLang } from "@/lib/server-lang";
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
  const zh = (await serverLang()) === "zh";
  const { date } = await searchParams;
  let issues: Awaited<ReturnType<typeof loadJuyaIssues>> = [];
  let error: string | null = null;
  try {
    issues = await loadJuyaIssues();
  } catch {
    error = zh ? "橘鸦 RSS 暂时拉不到，可稍后再试或访问原站。" : "Juya RSS is unavailable. Try later or visit the original site.";
  }

  const issue = pickJuyaIssue(issues, date);
  const archive = issues.slice(0, 30);

  return (
    <div className="kz-juya">
      <header className="kz-card kz-juya-head">
        <p className="kz-page-kicker">{zh ? "橘鸦 Juya · 外部早报" : "Juya · External daily brief"}</p>
        <h1 className="kz-page-title">{issue ? issue.title : (zh ? "橘鸦 AI 早报" : "Juya AI Daily")}</h1>
        <p className="kz-page-lede">
          {zh ? "内容来自 " : "Published by "}
          <a href={JUYA_HOME} target="_blank" rel="noopener noreferrer">
            daily.juya.uk
          </a>
          {zh ? "，在 Hot AI 阅读原文，不改写。" : ". Read the original Chinese brief in Hot AI."}
        </p>
        <div className="kz-digest-hosts">
          <a className="kz-chip" href={JUYA_HOME} target="_blank" rel="noopener noreferrer">
            {zh ? "原文站 ↗" : "Original site ↗"}
          </a>
          <a className="kz-chip" href={JUYA_VIDEO_BILI} target="_blank" rel="noopener noreferrer">
            {zh ? "B 站 ↗" : "Bilibili ↗"}
          </a>
          <a className="kz-chip" href={JUYA_VIDEO_YT} target="_blank" rel="noopener noreferrer">
            YouTube ↗
          </a>
        </div>
      </header>

      {error ? (
        <div className="kz-card kz-feed-empty">
          <p className="font-bold">{zh ? "加载失败" : "Could not load"}</p>
          <p>{error}</p>
        </div>
      ) : null}

      {archive.length > 1 ? (
        <nav className="kz-juya-dates" aria-label={zh ? "往期早报" : "Previous editions"}>
          {archive.map((it) => (
            <Link
              key={it.date}
              href={`/juya?date=${it.date}`}
              className={issue?.date === it.date ? "kz-chip kz-chip-yellow" : "kz-chip"}
            >
              {it.date.slice(5)}
            </Link>
          ))}
        </nav>
      ) : null}

      {issue ? (
        <article className="kz-card kz-juya-paper">
          {issue.toc.length > 2 ? (
            <details className="kz-juya-toc">
              <summary>{zh ? "目录" : "Contents"}</summary>
              <ol>
                {issue.toc.map((t) => (
                  <li key={t.id} className={t.level === 3 ? "kz-juya-toc-sub" : undefined}>
                    <a href={`#${t.id}`}>{t.text}</a>
                  </li>
                ))}
              </ol>
            </details>
          ) : null}
          <div lang="zh" className="reader-prose kz-juya-prose" dangerouslySetInnerHTML={{ __html: issue.html }} />
        </article>
      ) : !error ? (
        <div className="kz-card kz-feed-empty">
          <p className="font-bold">{zh ? "还没有早报" : "No brief yet"}</p>
          <p>{zh ? "RSS 里暂时没有带日期的条目。" : "The RSS feed has no dated editions yet."}</p>
        </div>
      ) : null}
    </div>
  );
}
