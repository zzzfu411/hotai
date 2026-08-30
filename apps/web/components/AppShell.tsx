"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
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
      <header className="kz-topbar">
        <div className="kz-topbar-row">
          <Link href="/" className="kz-logo">
            HOT AI
          </Link>
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
          <div className="kz-topbar-actions">
            <ThemeToggle />
            <LangToggle />
          </div>
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
                {lang === "zh" ? tab.label_zh : tab.label_en}
              </Link>
            );
          })}
        </nav>
      </header>

      <div className="kz-body">
        {rail ? <aside className="kz-rail">{rail}</aside> : null}
        <main className="kz-main">{children}</main>
      </div>

      <footer className="kz-foot">
        <a className="kz-footer-link" href="https://yeuxark.com">
          ← yeuxark.com
        </a>
      </footer>
    </div>
  );
}
