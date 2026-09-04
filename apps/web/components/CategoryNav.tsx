"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CSSProperties } from "react";
import { useLang } from "./LangContext";

type Item = { slug: string; label_en: string; label_zh: string };

function iconMask(slug: string): CSSProperties {
  const value = `url(/categories/${slug}.svg) center / contain no-repeat`;
  return { WebkitMask: value, mask: value };
}

export function CategoryNav({ categories }: { categories: readonly Item[] }) {
  const pathname = usePathname();
  const { lang } = useLang();
  return (
    <nav className="ha-tabs" aria-label={lang === "zh" ? "分类" : "Categories"}>
      {categories.map((c) => {
        const href = `/category/${c.slug}`;
        const active = pathname === href;
        return (
          <Link
            key={c.slug}
            href={href}
            className={active ? "ha-tab active" : "ha-tab"}
            aria-current={active ? "page" : undefined}
          >
            <span className="ha-sentiment-icon" style={iconMask(c.slug)} aria-hidden />
            {lang === "zh" ? c.label_zh : c.label_en}
          </Link>
        );
      })}
    </nav>
  );
}
