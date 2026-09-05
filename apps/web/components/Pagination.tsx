"use client";
import Link from "next/link";
import { useLang } from "./LangContext";
import { MAX_PAGE } from "@/lib/pagination";

export function Pagination({ page, hasMore, path, query = {} }: {
  page: number; hasMore: boolean; path: string; query?: Record<string, string>;
}) {
  const { lang } = useLang();
  const href = (next: number) => {
    const params = new URLSearchParams(query);
    if (next > 1) params.set("page", String(next));
    return `${path}${params.size ? `?${params}` : ""}`;
  };
  if (page === 1 && !hasMore) return null;
  return <nav className="kz-pagination" aria-label={lang === "zh" ? "分页" : "Pagination"}>
    {page > 1 && <Link className="kz-btn kz-btn-sm" href={href(page - 1)}>{lang === "zh" ? "上一页" : "Previous"}</Link>}
    <p>{lang === "zh" ? `第 ${page} 页` : `Page ${page}`}</p>
    {hasMore && page < MAX_PAGE && <Link className="kz-btn kz-btn-sm" href={href(page + 1)}>{lang === "zh" ? "下一页" : "Next"}</Link>}
    {hasMore && page >= MAX_PAGE && <p>{lang === "zh" ? "已达浏览上限，请缩小搜索范围。" : "Browsing limit reached. Narrow your search."}</p>}
  </nav>;
}
