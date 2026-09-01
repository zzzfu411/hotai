"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LangToggle } from "./LangToggle";
import { ThemeToggle } from "./ThemeToggle";
import { useLang } from "./LangContext";

const SCENES = [
  { href: "/", label_zh: "速闻", label_en: "Feed", code: "01" },
  { href: "/hot", label_zh: "热榜", label_en: "Hot AI", code: "02" },
  { href: "/digest", label_zh: "简报", label_en: "Digest", code: "03" },
  { href: "/juya", label_zh: "橘鸦", label_en: "Juya", code: "04" },
  { href: "/blogs", label_zh: "研究者", label_en: "Blogs", code: "05" },
  { href: "/subscribe", label_zh: "我的", label_en: "Mine", code: "06" },
] as const;

function tabActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  children,
  rail,
}: {
  children: React.ReactNode;
  rail?: React.ReactNode;
}) {
  const pathname = usePathname() || "/";
  const { lang } = useLang();

  return (
    <div className="kz-shell">
      <a className="kz-skip-link" href="#main-content">
        {lang === "zh" ? "跳到主要内容" : "Skip to main content"}
      </a>
      <header className="kz-topbar">
        <div className="kz-topbar-row">
          <Link
            href="/"
            className="kz-logo"
            aria-label={lang === "zh" ? "Hot AI 首页" : "Hot AI home"}
          >
            <span className="kz-logo-hot">HOT</span>
            <span className="kz-logo-ai">AI</span>
            <span className="kz-logo-pulse" aria-hidden />
          </Link>
          <div className="kz-brand-note">
            <strong lang="en">Signal desk</strong>
            <span>{lang === "zh" ? "从噪声里挑出信号" : "Signal over noise"}</span>
          </div>
          <div className="kz-topbar-actions">
            <ThemeToggle />
            <LangToggle />
          </div>
          <form className="kz-search" action="/search" method="get" role="search">
            <input
              className="kz-input"
              type="search"
              name="q"
              placeholder={lang === "zh" ? "搜索标题、摘要…" : "Search titles, summaries…"}
              aria-label={lang === "zh" ? "搜索" : "Search"}
            />
            <button className="kz-search-go" type="submit" aria-label={lang === "zh" ? "搜索" : "Search"}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
          </form>
        </div>
        <nav className="kz-tabs" aria-label={lang === "zh" ? "场景" : "Scenes"}>
          {SCENES.map((tab) => {
            const active = tabActive(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={active ? "kz-tab active" : "kz-tab"}
                aria-current={active ? "page" : undefined}
              >
                <span className="kz-tab-index" aria-hidden>{tab.code}</span>
                <span>{lang === "zh" ? tab.label_zh : tab.label_en}</span>
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="kz-body">
        {rail ? <aside className="kz-rail">{rail}</aside> : null}
        <main id="main-content" className="kz-main" tabIndex={-1}>{children}</main>
      </div>

      <footer className="kz-foot">
        <div className="kz-foot-inner">
          <p className="kz-foot-motto">SIGNAL, NOT NOISE.</p>
          <div className="kz-foot-note">
            <span>{lang === "zh" ? "独立 AI 新闻信号台" : "Independent AI news signal desk"}</span>
            <nav className="kz-foot-links" aria-label={lang === "zh" ? "页脚链接" : "Footer links"}>
              <Link href="/digest">{lang === "zh" ? "简报" : "Digest"}</Link>
              <Link href="/search">{lang === "zh" ? "搜索" : "Search"}</Link>
              <a href="/feed.xml">RSS</a>
            </nav>
          </div>
          <a className="kz-footer-link" href="https://yeuxark.com">
            ← yeuxark.com
          </a>
        </div>
      </footer>
    </div>
  );
}
