import Link from "next/link";
import { CATEGORIES, SITE } from "@/lib/constants";
import { LangToggle } from "./LangToggle";
import { CategoryNav } from "./CategoryNav";

export function Header() {
  return (
    <header className="sticky top-0 z-30 border-b border-ink-200/70 dark:border-ink-800/70 bg-white/80 dark:bg-ink-950/80 backdrop-blur">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-3 flex items-center gap-4">
        <Link href="/" className="flex items-center gap-2 font-bold text-lg tracking-tight">
          <span className="inline-block w-6 h-6 rounded-md fire-gradient" aria-hidden />
          <span>{SITE.name}</span>
        </Link>
        <CategoryNav categories={CATEGORIES} />
        <div className="ml-auto flex items-center gap-2">
          <a
            href="/feed.xml"
            className="text-xs text-ink-600 dark:text-ink-300 hover:text-accent"
            title="RSS feed"
          >
            RSS
          </a>
          <LangToggle />
        </div>
      </div>
    </header>
  );
}
