"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { SITE } from "@/lib/constants";
import { DensityToggle } from "./DensityToggle";
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

function LogoMark() {
  return (
    <svg className="kz-logo-mark" viewBox="0 0 24 24" aria-hidden>
      <rect width="24" height="24" rx="6" fill="#ffd60a" />
      <path d="M7 16.5v-5M12 16.5V7.5M17 16.5v-3" fill="none" stroke="#16181d" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
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
  const [headerHidden, setHeaderHidden] = useState(false);
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

  // On narrow screens the two-row header slides away while reading down the
  // page and returns on any upward scroll. It is a transform, not a layout
  // change, so nothing below it moves.
  useEffect(() => {
    const narrow = window.matchMedia("(max-width: 860px)");
    let lastY = window.scrollY;
    let frame = 0;
    const update = () => {
      frame = 0;
      const y = window.scrollY;
      const delta = y - lastY;
      if (!narrow.matches || y < 120) {
        setHeaderHidden(false);
        lastY = y;
      } else if (Math.abs(delta) >= 8) {
        setHeaderHidden(delta > 0);
        lastY = y;
      }
    };
    const onScroll = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.cancelAnimationFrame(frame);
    };
  }, []);

  // Keep the active scene visible when the nav scrolls horizontally (phones).
  useEffect(() => {
    const nav = navRef.current;
    setSearchOpen(false);
    setHeaderHidden(false);
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
      <header className={headerHidden && !searchOpen ? "kz-topbar is-hidden" : "kz-topbar"} ref={headerRef}>
        <div className="kz-topbar-inner">
          <Link href="/" className="kz-logo" aria-label={zh ? "Hot AI 首页" : "Hot AI home"}>
            <LogoMark />
            <span>Hot AI</span>
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
            <DensityToggle />
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
          <p>
            <span className="kz-foot-motto">Hot AI</span> · {zh ? SITE.tagline_zh : SITE.tagline_en}
          </p>
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
