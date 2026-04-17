"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLang } from "./LangContext";

type Item = { slug: string; label_en: string; label_zh: string };

export function CategoryNav({ categories }: { categories: readonly Item[] }) {
  const pathname = usePathname();
  const { lang } = useLang();
  return (
    <nav className="hidden sm:flex items-center gap-1 text-sm">
      {categories.map((c) => {
        const href = `/category/${c.slug}`;
        const active = pathname === href;
        return (
          <Link
            key={c.slug}
            href={href}
            className={`px-2.5 py-1 rounded-md transition ${
              active
                ? "bg-accent/10 text-accent-deep dark:text-accent"
                : "text-ink-600 dark:text-ink-300 hover:bg-ink-100 dark:hover:bg-ink-800"
            }`}
          >
            {lang === "zh" ? c.label_zh : c.label_en}
          </Link>
        );
      })}
    </nav>
  );
}
