import Link from "next/link";
import Image from "next/image";
import { CATEGORIES, SITE } from "@/lib/constants";
import { LangToggle } from "./LangToggle";
import { CategoryNav } from "./CategoryNav";
import { ThemeToggle } from "./ThemeToggle";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-200/70 dark:border-ink-800/70 bg-white/75 dark:bg-ink-950/75 backdrop-blur supports-[backdrop-filter]:bg-white/60 supports-[backdrop-filter]:dark:bg-ink-950/60">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-3 sm:gap-5">
        <Link
          href="/"
          className="flex items-center gap-2 font-bold text-lg tracking-tight shrink-0 group"
        >
          <span className="relative inline-flex w-7 h-7">
            <Image
              src="/logo.svg"
              alt=""
              width={28}
              height={28}
              priority
              className="rounded-md shadow-sm shadow-ember-500/30 group-hover:shadow-ember-500/60 transition-shadow"
            />
          </span>
          <span className="hidden sm:inline">{SITE.name}</span>
        </Link>
        <CategoryNav categories={CATEGORIES} />
        <div className="ml-auto flex items-center gap-1.5 sm:gap-2">
          <Link
            href="/digest"
            className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-md text-ember-700 dark:text-ember-200 bg-ember-50 dark:bg-ember-900/30 border border-ember-200 dark:border-ember-700/60 hover:bg-ember-100 dark:hover:bg-ember-900/50 transition"
            title="Today's AI-generated brief"
          >
            <span aria-hidden>✶</span> Digest
          </Link>
          <Link
            href="/search"
            className="inline-flex items-center justify-center w-8 h-8 rounded-md border border-ink-200 dark:border-ink-700 hover:bg-ink-100 dark:hover:bg-ink-800 transition"
            aria-label="Search"
            title="Search"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
          </Link>
          <a
            href="/feed.xml"
            className="hidden sm:inline text-xs text-ink-600 dark:text-ink-300 hover:text-accent px-2"
            title="RSS feed"
          >
            RSS
          </a>
          <ThemeToggle />
          <LangToggle />
        </div>
      </div>
    </header>
  );
}
