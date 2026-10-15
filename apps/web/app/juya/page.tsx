import { serverLang } from "@/lib/server-lang";
import Link from "next/link";
import type { Metadata } from "next";
import { JuyaExpandAll, JuyaLightbox, JuyaRail } from "@/components/JuyaTools";
import { ReadingProgress } from "@/components/ReadingProgress";
import {
  JUYA_HOME,
  JUYA_VIDEO_BILI,
  JUYA_VIDEO_YT,
  loadJuyaIssues,
  pickJuyaIssue,
  type JuyaIssue,
} from "@/lib/juya";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type PageProps = { searchParams: Promise<{ date?: string }> };

const WEEKDAY_ZH = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
const WEEKDAY_EN = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const VIDEO_LABEL = { youtube: "YouTube", bilibili: "哔哩哔哩" } as const;

function weekday(date: string, zh: boolean): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return Number.isNaN(day) ? "" : (zh ? WEEKDAY_ZH : WEEKDAY_EN)[day]!;
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { date } = await searchParams;
  const issue = pickJuyaIssue(await loadJuyaIssues().catch(() => []), date);
  return {
    title: issue ? `橘鸦早报 ${issue.date}` : "橘鸦早报",
    description: "橘鸦 Juya 的每日 AI 早报，在 Hot AI 里阅读。",
  };
}

function Step({ issue, dir, zh }: { issue: JuyaIssue | null; dir: "older" | "newer"; zh: boolean }) {
  const label = dir === "older" ? (zh ? "上一期" : "Previous") : zh ? "下一期" : "Next";
  const glyph = dir === "older" ? "‹" : "›";
  if (!issue) {
    return (
      <span className="kz-juya-step" aria-hidden>
        {glyph}
      </span>
    );
  }
  return (
    <Link
      className="kz-juya-step"
      href={`/juya?date=${issue.date}`}
      rel={dir === "older" ? "prev" : "next"}
      aria-label={`${label} ${issue.date}`}
      title={`${label} ${issue.date.slice(5)}`}
    >
      {glyph}
    </Link>
  );
}

export default async function JuyaPage({ searchParams }: PageProps) {
  const zh = (await serverLang()) === "zh";
  const { date } = await searchParams;
  let issues: JuyaIssue[] = [];
  let error: string | null = null;
  try {
    issues = await loadJuyaIssues();
  } catch {
    error = zh ? "橘鸦 RSS 暂时拉不到，可稍后再试或访问原站。" : "Juya RSS is unavailable. Try later or visit the original site.";
  }

  const issue = pickJuyaIssue(issues, date);
  const at = issue ? issues.indexOf(issue) : -1;
  const older = at >= 0 ? (issues[at + 1] ?? null) : null;
  const newer = at > 0 ? (issues[at - 1] ?? null) : null;
  const watch = issue?.videos[0]?.url ?? null;

  return (
    <div className="kz-juya">
      {error ? (
        <div className="kz-card kz-feed-empty">
          <p className="font-bold">{zh ? "加载失败" : "Could not load"}</p>
          <p>{error}</p>
        </div>
      ) : null}

      {issue ? (
        // Keyed by edition so client state (expanded stories, active heading) starts fresh.
        <div className="kz-juya-layout" key={issue.date}>
          <article className="kz-juya-main">
            <ReadingProgress root=".kz-juya-main" end=".kz-juya-end" />
            <header className={issue.cover ? "kz-juya-head has-cover" : "kz-juya-head"}>
              <div className="kz-juya-head-text">
                <div className="kz-juya-kicker">
                  <p className="kz-page-kicker">
                    {zh ? "橘鸦" : "Juya"} · {weekday(issue.date, zh)}
                  </p>
                  <nav className="kz-juya-steps" aria-label={zh ? "前后两期" : "Adjacent editions"}>
                    <Step issue={older} dir="older" zh={zh} />
                    <Step issue={newer} dir="newer" zh={zh} />
                  </nav>
                </div>
                <h1 className="kz-page-title">{issue.title}</h1>
                <p className="kz-juya-meta">
                  {issue.count ? <span>{zh ? `${issue.count} 条` : `${issue.count} stories`}</span> : null}
                  {issue.videos.map((video) => (
                    <a key={video.platform} href={video.url} target="_blank" rel="noopener noreferrer">
                      ▶ {VIDEO_LABEL[video.platform]}
                    </a>
                  ))}
                  <a href={issue.url} target="_blank" rel="noopener noreferrer">
                    {zh ? "原文 ↗" : "Original ↗"}
                  </a>
                  <JuyaExpandAll zh={zh} available={issue.count > 0} />
                </p>
              </div>
              {issue.cover ? (
                <a
                  className="kz-juya-cover"
                  href={watch ?? issue.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={watch ? (zh ? "看视频版" : "Watch the video") : zh ? "原文" : "Original"}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={issue.cover} alt="" width={1080} height={460} decoding="async" />
                  {watch ? <span className="kz-juya-play" aria-hidden>▶</span> : null}
                </a>
              ) : null}
            </header>

            <div lang="zh" className="kz-juya-body" dangerouslySetInnerHTML={{ __html: issue.html }} />

            <footer className="kz-juya-end">
              <nav className="kz-juya-pager" aria-label={zh ? "前后两期" : "Adjacent editions"}>
                {older ? (
                  <Link href={`/juya?date=${older.date}`} rel="prev">
                    <span>{zh ? "← 上一期" : "← Previous"}</span>
                    {older.date}
                  </Link>
                ) : (
                  <span />
                )}
                {newer ? (
                  <Link href={`/juya?date=${newer.date}`} rel="next" className="is-next">
                    <span>{zh ? "下一期 →" : "Next →"}</span>
                    {newer.date}
                  </Link>
                ) : null}
              </nav>
              <p className="kz-juya-credit">
                {zh ? "内容来自 " : "Published by Juya at "}
                <a href={JUYA_HOME} target="_blank" rel="noopener noreferrer">
                  daily.juya.uk
                </a>
                {zh
                  ? "，由 AI 辅助编写，请以原始出处为准；Hot AI 只重新排版，不改写。视频："
                  : ", written with AI help — check the original sources. Hot AI only re-lays it out. Video: "}
                <a href={JUYA_VIDEO_BILI} target="_blank" rel="noopener noreferrer">
                  {zh ? "B 站" : "Bilibili"}
                </a>
                {" · "}
                <a href={JUYA_VIDEO_YT} target="_blank" rel="noopener noreferrer">
                  YouTube
                </a>
              </p>
            </footer>
          </article>
          <JuyaRail
            toc={issue.toc}
            dates={issues.slice(0, 30).map((it) => it.date)}
            current={issue.date}
            zh={zh}
          />
          <JuyaLightbox zh={zh} />
        </div>
      ) : !error ? (
        <div className="kz-card kz-feed-empty">
          <p className="font-bold">{zh ? "还没有早报" : "No brief yet"}</p>
          <p>{zh ? "RSS 里暂时没有带日期的条目。" : "The RSS feed has no dated editions yet."}</p>
        </div>
      ) : null}
    </div>
  );
}
