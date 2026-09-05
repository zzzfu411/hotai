"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
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
  const [searchOpen, setSearchOpen] = useState(false);
  const headerRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const observer = new ResizeObserver(() => {
      document.documentElement.style.setProperty("--topbar-offset", `${header.getBoundingClientRect().height + 8}px`);
    });
    observer.observe(header);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const align = () => {
      const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
      if (!active) return;
      const item = active.getBoundingClientRect();
      const frame = nav.getBoundingClientRect();
      nav.scrollLeft += item.left - frame.left - (nav.clientWidth - item.width) / 2;
    };
    align();
    const observer = new ResizeObserver(align);
    observer.observe(nav);
    setSearchOpen(false);
    return () => observer.disconnect();
  }, [pathname]);
  useEffect(() => { if (searchOpen) searchRef.current?.focus(); }, [searchOpen]);

  return (
    <div className="kz-shell">
      <a className="kz-skip-link" href="#main-content">
        {lang === "zh" ? "跳到主要内容" : "Skip to main content"}
      </a>
      <header className="kz-topbar" ref={headerRef}>
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
            <button type="button" className="kz-mobile-search kz-chip" aria-expanded={searchOpen} aria-controls="global-search"
              onClick={() => setSearchOpen(open => !open)}>{lang === "zh" ? "搜索" : "Search"}</button>
            <ThemeToggle />
            <LangToggle />
          </div>
          <form id="global-search" className={`kz-search kz-global-search${searchOpen ? " is-open" : ""}`} action="/search" method="get" role="search">
            <input
              ref={searchRef}
              className="kz-input"
              type="search"
              name="q"
              placeholder={lang === "zh" ? "搜索 AI 入库文章…" : "Search stored AI stories…"}
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
        <nav className="kz-tabs" ref={navRef} aria-label={lang === "zh" ? "场景" : "Scenes"}>
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
            <span>{lang === "zh" ? "多源新闻与 AI 热榜" : "Live news and AI headlines"}</span>
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
