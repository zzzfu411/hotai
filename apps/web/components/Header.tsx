import Link from "next/link";
import { CATEGORIES } from "@/lib/constants";
import { LangToggle } from "./LangToggle";
import { CategoryNav } from "./CategoryNav";
import { ThemeToggle } from "./ThemeToggle";
import { useLang } from "./LangContext";

/** Legacy top bar — AppShell is the mounted shell. */
export function Header() {
  const { lang } = useLang();
  return (
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
        <CategoryNav categories={CATEGORIES} />
        <div className="ha-topbar-actions">
          <Link href="/blogs" className="ha-btn">
            {lang === "zh" ? "研究者" : "Blogs"}
          </Link>
          <Link href="/digest" className="ha-btn">
            {lang === "zh" ? "简报" : "Digest"}
          </Link>
          <Link
            href="/search"
            className="ha-btn ha-btn-icon"
            aria-label={lang === "zh" ? "搜索" : "Search"}
            title={lang === "zh" ? "搜索" : "Search"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </Link>
          <a href="/feed.xml" className="ha-btn" title="RSS feed">
            RSS
          </a>
          <ThemeToggle />
          <LangToggle />
        </div>
      </div>
    </header>
  );
}
