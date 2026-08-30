import Link from "next/link";
import { CATEGORIES } from "@/lib/constants";
import { LangToggle } from "./LangToggle";
import { CategoryNav } from "./CategoryNav";
import { ThemeToggle } from "./ThemeToggle";

/** Legacy top bar — AppShell is the mounted chrome. Kept as a KAZAM-skinned fallback. */
export function Header() {
  return (
    <header className="kz-topbar">
      <div className="kz-topbar-row">
        <Link href="/" className="kz-logo">
          HOT AI
        </Link>
        <CategoryNav categories={CATEGORIES} />
        <div className="kz-topbar-actions">
          <Link href="/blogs" className="kz-btn">
            Blogs
          </Link>
          <Link href="/digest" className="kz-btn">
            Digest
          </Link>
          <Link href="/search" className="kz-btn kz-btn-icon" aria-label="Search" title="Search">
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
