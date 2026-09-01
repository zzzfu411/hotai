"use client";

import { useState } from "react";
import { safeHttpUrl } from "@/lib/safe-url";
import { useLang } from "./LangContext";

export type GuideStartHereItem = {
  title: string;
  url?: string;
  noteEn?: string;
  noteZh?: string;
};

export type BlogCardData = {
  slug: string;
  name: string;
  author: string;
  url: string;
  feedUrl: string | null;
  affiliation: string | null;
  bioEn: string;
  bioZh: string;
  tags: string[];
  lang: string;
  featured: boolean;
  guideCadenceEn: string | null;
  guideCadenceZh: string | null;
  guideHowEn: string | null;
  guideHowZh: string | null;
  guideTimelineEn: string | null;
  guideTimelineZh: string | null;
  guideStartHere: GuideStartHereItem[];
};

function faviconFor(url: string) {
  const safe = safeHttpUrl(url);
  if (!safe) return null;
  try {
    const host = new URL(safe).hostname;
    return `https://www.google.com/s2/favicons?sz=64&domain=${host}`;
  } catch {
    return null;
  }
}

function hostnameOf(url: string) {
  const safe = safeHttpUrl(url);
  if (!safe) return "";
  try {
    return new URL(safe).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

const TAG_LABEL: Record<string, { en: string; zh: string }> = {
  llm: { en: "LLM", zh: "大模型" },
  research: { en: "Research", zh: "研究" },
  engineering: { en: "Engineering", zh: "工程" },
  interpretability: { en: "Interpretability", zh: "可解释性" },
  systems: { en: "Systems", zh: "系统" },
  alignment: { en: "Alignment", zh: "对齐" },
  tutorial: { en: "Tutorial", zh: "教程" },
  "open-source": { en: "Open Source", zh: "开源" },
  agents: { en: "Agents", zh: "智能体" },
  chinese: { en: "Chinese", zh: "中文" },
  survey: { en: "Survey", zh: "综述" },
  opinion: { en: "Opinion", zh: "观点" },
  industry: { en: "Industry", zh: "产业" },
  tools: { en: "Tools", zh: "工具" },
  evaluation: { en: "Evaluation", zh: "评测" },
  robotics: { en: "Robotics", zh: "机器人" },
};

function hasGuide(blog: BlogCardData) {
  return Boolean(
    blog.guideHowEn ||
      blog.guideHowZh ||
      blog.guideTimelineEn ||
      blog.guideTimelineZh ||
      blog.guideCadenceEn ||
      blog.guideCadenceZh ||
      blog.guideStartHere.length > 0,
  );
}

export function BlogCard({ blog }: { blog: BlogCardData }) {
  const { lang } = useLang();
  const zh = lang === "zh";
  const [open, setOpen] = useState(false);
  const blogUrl = safeHttpUrl(blog.url);
  const feedUrl = blog.feedUrl ? safeHttpUrl(blog.feedUrl) : null;
  const fav = blogUrl ? faviconFor(blogUrl) : null;
  const bio = zh ? blog.bioZh : blog.bioEn;
  const host = hostnameOf(blog.url);
  const guide = hasGuide(blog);

  const cadence = zh ? blog.guideCadenceZh : blog.guideCadenceEn;
  const how = zh ? blog.guideHowZh : blog.guideHowEn;
  const timeline = zh ? blog.guideTimelineZh : blog.guideTimelineEn;

  return (
    <article id={blog.slug} className="kz-card kz-blog-card">
      <div className="kz-blog-top">
        <div className="kz-blog-fav">
          {fav ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={fav} alt="" width={28} height={28} loading="lazy" />
          ) : (
            <span aria-hidden>{blog.author.slice(0, 1).toUpperCase()}</span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="kz-blog-name">
            {blogUrl ? (
              <a href={blogUrl} target="_blank" rel="noopener noreferrer">{blog.name}</a>
            ) : blog.name}
          </h3>
          <p className="kz-blog-by">
            <strong>{blog.author}</strong>
            {blog.affiliation ? ` · ${blog.affiliation}` : ""}
          </p>
        </div>
        {blog.featured && <span className="kz-chip kz-chip-yellow">{zh ? "精选" : "Featured"}</span>}
        {blog.lang === "zh" && (
          <span className="kz-chip" title="Primarily Chinese">
            中
          </span>
        )}
      </div>

      <p className="kz-blog-bio">{bio}</p>

      {blog.tags.length > 0 && (
        <div className="kz-blog-tags">
          {blog.tags.slice(0, 5).map((t) => {
            const label = TAG_LABEL[t];
            return (
              <span key={t} className="kz-chip">
                {label ? (zh ? label.zh : label.en) : t}
              </span>
            );
          })}
        </div>
      )}

      {guide && (
        <div className="kz-blog-guide">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={open ? "kz-btn kz-blog-guide-toggle active" : "kz-btn kz-blog-guide-toggle"}
          >
            <span>{zh ? "食用指南" : "Reading guide"}</span>
            <span aria-hidden>{open ? "▴" : "▾"}</span>
          </button>

          {open && (
            <div className="kz-blog-guide-panel">
              {cadence && (
                <section>
                  <h4>{zh ? "更新节奏" : "Cadence"}</h4>
                  <p>{cadence}</p>
                </section>
              )}

              {how && (
                <section>
                  <h4>{zh ? "怎么看" : "How to read"}</h4>
                  <p>{how}</p>
                </section>
              )}

              {timeline && (
                <section>
                  <h4>{zh ? "内容时间线" : "Timeline"}</h4>
                  <p>{timeline}</p>
                </section>
              )}

              {blog.guideStartHere.length > 0 && (
                <section>
                  <h4>{zh ? "推荐从这里开始" : "Start here"}</h4>
                  <ol className="kz-blog-start">
                    {blog.guideStartHere.map((item, i) => {
                      const note = zh ? item.noteZh : item.noteEn;
                      const inner = (
                        <>
                          <span>
                            {i + 1}. {item.title}
                          </span>
                          {note && <span className="kz-blog-start-note">{note}</span>}
                        </>
                      );
                      return (
                        <li key={`${item.title}-${i}`}>
                          {item.url && safeHttpUrl(item.url) ? (
                            <a href={safeHttpUrl(item.url)!} target="_blank" rel="noopener noreferrer">
                              {inner}
                              <span className="kz-blog-start-note">{zh ? "打开 ↗" : "Open ↗"}</span>
                            </a>
                          ) : (
                            <div>{inner}</div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </section>
              )}

              {feedUrl && (
                <p className="kz-blog-rss">
                  {zh ? "订阅：" : "Subscribe: "}
                  <a href={feedUrl} target="_blank" rel="noopener noreferrer">
                    RSS
                  </a>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="kz-blog-foot">
        {blogUrl ? (
          <a href={blogUrl} target="_blank" rel="noopener noreferrer" className="kz-btn kz-btn-sm">
            {zh ? "打开博客" : "Visit blog"} ↗
          </a>
        ) : null}
        <span className="kz-blog-host">{host}</span>
      </div>
    </article>
  );
}
