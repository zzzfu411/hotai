import Link from "next/link";
import { CATEGORIES } from "@/lib/constants";
import { LangToggle } from "./LangToggle";
import { CategoryNav } from "./CategoryNav";
import { ThemeToggle } from "./ThemeToggle";
import { useLang } from "./LangContext";

/** Legacy top bar — AppShell is the mounted chrome. Kept as a KAZAM-skinned fallback. */
export function Header() {
  const { lang } = useLang();
  return (
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
        <CategoryNav categories={CATEGORIES} />
        <div className="kz-topbar-actions">
          <Link href="/blogs" className="kz-btn">
            {lang === "zh" ? "研究者" : "Blogs"}
          </Link>
          <Link href="/digest" className="kz-btn">
            {lang === "zh" ? "简报" : "Digest"}
          </Link>
          <Link
            href="/search"
            className="kz-btn kz-btn-icon"
            aria-label={lang === "zh" ? "搜索" : "Search"}
            title={lang === "zh" ? "搜索" : "Search"}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </Link>
          <a href="/feed.xml" className="kz-btn" title="RSS feed">
            RSS
          </a>
          <ThemeToggle />
          <LangToggle />
        </div>
      </div>
    </header>
  );
}
