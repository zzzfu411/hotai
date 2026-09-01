"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LangToggle } from "./LangToggle";
import { ThemeToggle } from "./ThemeToggle";
import { useLang } from "./LangContext";

const SCENES = [
  { href: "/", label_zh: "今日", label_en: "Today" },
  { href: "/hot", label_zh: "热榜", label_en: "Ranked" },
  { href: "/digest", label_zh: "简报", label_en: "Digest" },
  { href: "/juya", label_zh: "橘鸦", label_en: "Juya" },
  { href: "/blogs", label_zh: "研究者", label_en: "Researchers" },
  { href: "/subscribe", label_zh: "订阅", label_en: "Subscriptions" },
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
    <div className="ha-shell">
      <a className="ha-skip-link" href="#main-content">
        {lang === "zh" ? "跳到主要内容" : "Skip to main content"}
      </a>
      <header className="ha-topbar">
        <div className="ha-topbar-row">
          <Link
            href="/"
            className="ha-logo"
            aria-label={lang === "zh" ? "LAMDA briefing 首页" : "LAMDA briefing home"}
          >
            <span className="ha-logo-wordmark">{lang === "zh" ? "速闻" : "Brief"}</span>
          </Link>
          <div className="ha-brand-note">
            <strong lang="en">LAMDA / RIA</strong>
            <span>{lang === "zh" ? "私有 AI 研究简报" : "Private AI research briefing"}</span>
          </div>
          <div className="ha-topbar-actions">
            <ThemeToggle />
            <LangToggle />
          </div>
          <form className="ha-search" action="/search" method="get" role="search">
            <input
              className="ha-input"
              type="search"
              name="q"
              placeholder={lang === "zh" ? "搜索标题、摘要…" : "Search titles, summaries…"}
              aria-label={lang === "zh" ? "搜索" : "Search"}
            />
            <button className="ha-search-go" type="submit" aria-label={lang === "zh" ? "搜索" : "Search"}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
            </button>
          </form>
        </div>
        <nav className="ha-tabs" aria-label={lang === "zh" ? "场景" : "Scenes"}>
          {SCENES.map((tab) => {
            const active = tabActive(pathname, tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={active ? "ha-tab active" : "ha-tab"}
                aria-current={active ? "page" : undefined}
              >
                <span>{lang === "zh" ? tab.label_zh : tab.label_en}</span>
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="ha-body">
        {rail ? <aside className="ha-rail">{rail}</aside> : null}
        <main id="main-content" className="ha-main" tabIndex={-1}>{children}</main>
      </div>

      <footer className="ha-foot">
        <div className="ha-foot-inner">
          <p className="ha-foot-motto">LAMDA / BRIEFING</p>
          <div className="ha-foot-note">
            <span>{lang === "zh" ? "给 Ria 的私有 AI 阅读桌" : "A private AI reading desk for Ria"}</span>
            <nav className="ha-foot-links" aria-label={lang === "zh" ? "页脚链接" : "Footer links"}>
              <Link href="/digest">{lang === "zh" ? "简报" : "Digest"}</Link>
              <Link href="/search">{lang === "zh" ? "搜索" : "Search"}</Link>
              <a href="/feed.xml">RSS</a>
            </nav>
          </div>
          <a className="ha-footer-link" href="https://yeuxark.com">
            ← yeuxark.com
          </a>
        </div>
      </footer>
    </div>
  );
}
