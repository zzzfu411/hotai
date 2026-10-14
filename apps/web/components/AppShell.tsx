"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { LangToggle } from "./LangToggle";
import { ThemeToggle } from "./ThemeToggle";
import { useLang } from "./LangContext";

const SCENES = [
  { href: "/", label_zh: "速闻", label_en: "Feed" },
  { href: "/hot", label_zh: "热榜", label_en: "Hot AI" },
  { href: "/digest", label_zh: "简报", label_en: "Digest" },
  { href: "/juya", label_zh: "橘鸦", label_en: "Juya" },
  { href: "/blogs", label_zh: "研究者", label_en: "Blogs" },
  { href: "/subscribe", label_zh: "我的", label_en: "Mine" },
] as const;

function tabActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const { lang } = useLang();
  const zh = lang === "zh";
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

  // Keep the active scene visible when the nav scrolls horizontally (phones).
  useEffect(() => {
    const nav = navRef.current;
    setSearchOpen(false);
    if (!nav || nav.scrollWidth <= nav.clientWidth) return;
    const active = nav.querySelector<HTMLElement>('[aria-current="page"]');
    if (!active) return;
    nav.scrollLeft = active.offsetLeft - (nav.clientWidth - active.offsetWidth) / 2;
  }, [pathname]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  return (
    <div className="kz-shell">
      <a className="kz-skip-link" href="#main-content">
        {zh ? "跳到主要内容" : "Skip to main content"}
      </a>
      <header className="kz-topbar" ref={headerRef}>
        <div className="kz-topbar-inner">
          <Link href="/" className="kz-logo" aria-label={zh ? "Hot AI 首页" : "Hot AI home"}>
            <span className="kz-logo-hot">HOT</span>
            <span className="kz-logo-ai">AI</span>
            <span className="kz-logo-pulse" aria-hidden />
          </Link>

          <nav className="kz-nav" ref={navRef} aria-label={zh ? "栏目" : "Sections"}>
            {SCENES.map((tab) => {
              const active = tabActive(pathname, tab.href);
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  className={active ? "kz-nav-link active" : "kz-nav-link"}
                  aria-current={active ? "page" : undefined}
                >
                  {zh ? tab.label_zh : tab.label_en}
                </Link>
              );
            })}
          </nav>

          <div className="kz-topbar-actions">
            <form
              id="global-search"
              className={searchOpen ? "kz-search kz-global-search is-open" : "kz-search kz-global-search"}
              action="/search"
              method="get"
              role="search"
            >
              <input
                ref={searchRef}
                className="kz-input"
                type="search"
                name="q"
                placeholder={zh ? "搜索入库文章…" : "Search stored stories…"}
                aria-label={zh ? "搜索" : "Search"}
              />
              <button className="kz-search-go" type="submit" aria-label={zh ? "搜索" : "Search"}>
                <SearchIcon />
              </button>
            </form>
            <button
              type="button"
              className="kz-btn kz-btn-icon kz-search-toggle"
              aria-expanded={searchOpen}
              aria-controls="global-search"
              aria-label={zh ? "搜索" : "Search"}
              onClick={() => setSearchOpen((open) => !open)}
            >
              <SearchIcon />
            </button>
            <ThemeToggle />
            <LangToggle />
          </div>
        </div>
      </header>

      <main id="main-content" className="kz-main" tabIndex={-1}>
        {children}
      </main>

      <footer className="kz-foot">
        <div className="kz-foot-inner">
          <p className="kz-foot-motto">SIGNAL, NOT NOISE.</p>
          <nav className="kz-foot-links" aria-label={zh ? "页脚链接" : "Footer links"}>
            <Link href="/digest">{zh ? "简报" : "Digest"}</Link>
            <Link href="/search">{zh ? "搜索" : "Search"}</Link>
            <a href="/feed.xml">RSS</a>
            <a href="/hotai.opml">OPML</a>
          </nav>
          <a className="kz-footer-link" href="https://yeuxark.com">
            ← yeuxark.com
          </a>
        </div>
      </footer>
    </div>
  );
}
