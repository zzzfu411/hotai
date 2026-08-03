"use client";

import { useState } from "react";
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
  try {
    const host = new URL(url).hostname;
    return `https://www.google.com/s2/favicons?sz=64&domain=${host}`;
  } catch {
    return null;
  }
}

function hostnameOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
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

export function BlogCard({ blog, index = 0 }: { blog: BlogCardData; index?: number }) {
  const { lang } = useLang();
  const [open, setOpen] = useState(false);
  const fav = faviconFor(blog.url);
  const bio = lang === "zh" ? blog.bioZh : blog.bioEn;
  const host = hostnameOf(blog.url);
  const guide = hasGuide(blog);

  const cadence = lang === "zh" ? blog.guideCadenceZh : blog.guideCadenceEn;
  const how = lang === "zh" ? blog.guideHowZh : blog.guideHowEn;
  const timeline = lang === "zh" ? blog.guideTimelineZh : blog.guideTimelineEn;

  return (
    <article
      id={blog.slug}
      className={`group relative flex flex-col h-full card-surface p-5 sm:p-6 transition hover:border-accent/50 hover:shadow-md hover:shadow-ember-500/5 animate-fade-up ${
        blog.featured ? "ring-1 ring-ember-500/20" : ""
      }`}
      style={{ animationDelay: `${Math.min(index, 12) * 35}ms` }}
    >
      {blog.featured && (
        <span className="absolute -top-2.5 left-4 chip-accent shadow-sm">
          <span aria-hidden>✶</span>
          {lang === "zh" ? "精选" : "Featured"}
        </span>
      )}

      <div className="flex items-start gap-3">
        <div className="relative shrink-0">
          <div className="w-11 h-11 rounded-xl border border-ink-200/80 dark:border-ink-700/80 bg-ink-50 dark:bg-ink-800/60 flex items-center justify-center overflow-hidden">
            {fav ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={fav} alt="" width={28} height={28} className="w-7 h-7" loading="lazy" />
            ) : (
              <span className="text-sm font-bold text-ember-600">
                {blog.author.slice(0, 1).toUpperCase()}
              </span>
            )}
          </div>
        </div>

        <div className="min-w-0 flex-1">
          <h3 className="font-bold text-base sm:text-lg leading-snug tracking-tight">
            <a
              href={blog.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-accent transition"
            >
              {blog.name}
            </a>
          </h3>
          <p className="mt-0.5 text-sm text-ink-600 dark:text-ink-300">
            <span className="font-medium text-ink-800 dark:text-ink-100">{blog.author}</span>
            {blog.affiliation && (
              <>
                <span className="mx-1.5 text-ink-300 dark:text-ink-600">·</span>
                <span>{blog.affiliation}</span>
              </>
            )}
          </p>
        </div>

        {blog.lang === "zh" && (
          <span className="chip-soft shrink-0" title="Primarily Chinese">
            中
          </span>
        )}
      </div>

      <p className="mt-3 text-sm text-ink-600 dark:text-ink-300 leading-relaxed line-clamp-3">
        {bio}
      </p>

      {blog.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {blog.tags.slice(0, 5).map((t) => {
            const label = TAG_LABEL[t];
            return (
              <span key={t} className="chip-soft">
                {label ? (lang === "zh" ? label.zh : label.en) : t}
              </span>
            );
          })}
        </div>
      )}

      {/* 食用指南 */}
      {guide && (
        <div className="mt-4">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-sm font-semibold border transition ${
              open
                ? "border-violet-400/60 bg-violet-50/80 dark:bg-violet-900/25 text-violet-800 dark:text-violet-200"
                : "border-ink-200 dark:border-ink-700 text-ink-700 dark:text-ink-200 hover:border-violet-400/50 hover:text-violet-700 dark:hover:text-violet-200"
            }`}
          >
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden>📖</span>
              {lang === "zh" ? "食用指南" : "Reading guide"}
            </span>
            <span
              aria-hidden
              className={`text-xs transition-transform ${open ? "rotate-180" : ""}`}
            >
              ▾
            </span>
          </button>

          {open && (
            <div className="mt-3 space-y-3.5 rounded-xl border border-violet-200/60 dark:border-violet-800/40 bg-violet-50/40 dark:bg-violet-950/20 p-3.5 sm:p-4 text-sm leading-relaxed animate-fade-up">
              {cadence && (
                <section>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                    {lang === "zh" ? "更新节奏" : "Cadence"}
                  </h4>
                  <p className="mt-1 text-ink-700 dark:text-ink-200">{cadence}</p>
                </section>
              )}

              {how && (
                <section>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                    {lang === "zh" ? "怎么看" : "How to read"}
                  </h4>
                  <p className="mt-1 text-ink-700 dark:text-ink-200">{how}</p>
                </section>
              )}

              {timeline && (
                <section>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                    {lang === "zh" ? "内容时间线" : "Timeline"}
                  </h4>
                  <p className="mt-1 text-ink-700 dark:text-ink-200">{timeline}</p>
                </section>
              )}

              {blog.guideStartHere.length > 0 && (
                <section>
                  <h4 className="text-[11px] font-bold uppercase tracking-wider text-violet-700 dark:text-violet-300">
                    {lang === "zh" ? "推荐从这里开始" : "Start here"}
                  </h4>
                  <ol className="mt-2 space-y-2">
                    {blog.guideStartHere.map((item, i) => {
                      const note = lang === "zh" ? item.noteZh : item.noteEn;
                      const inner = (
                        <>
                          <span className="font-semibold text-ink-900 dark:text-ink-100">
                            {i + 1}. {item.title}
                          </span>
                          {note && (
                            <span className="block mt-0.5 text-xs text-ink-500 dark:text-ink-400">
                              {note}
                            </span>
                          )}
                        </>
                      );
                      return (
                        <li key={`${item.title}-${i}`}>
                          {item.url ? (
                            <a
                              href={item.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block rounded-lg px-2.5 py-2 -mx-1 border border-transparent hover:border-violet-300/50 hover:bg-white/60 dark:hover:bg-ink-900/40 transition"
                            >
                              {inner}
                              <span className="mt-0.5 inline-block text-[11px] text-violet-600 dark:text-violet-300">
                                {lang === "zh" ? "打开 ↗" : "Open ↗"}
                              </span>
                            </a>
                          ) : (
                            <div className="px-2.5 py-2 -mx-1">{inner}</div>
                          )}
                        </li>
                      );
                    })}
                  </ol>
                </section>
              )}

              {blog.feedUrl && (
                <p className="pt-1 border-t border-violet-200/50 dark:border-violet-800/40 text-xs text-ink-500 dark:text-ink-400">
                  {lang === "zh" ? "订阅：" : "Subscribe: "}
                  <a
                    href={blog.feedUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-mono text-violet-700 dark:text-violet-300 hover:underline break-all"
                  >
                    RSS
                  </a>
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-ink-200/60 dark:border-ink-800/60 flex items-center justify-between gap-2 mt-auto">
        <a
          href={blog.url}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-ember-700 dark:text-ember-200 group-hover:text-accent transition"
        >
          {lang === "zh" ? "打开博客" : "Visit blog"}
          <span aria-hidden className="transition-transform group-hover:translate-x-0.5">
            ↗
          </span>
        </a>
        <span className="text-[11px] text-ink-400 dark:text-ink-500 font-mono truncate max-w-[45%]">
          {host}
        </span>
      </div>
    </article>
  );
}
