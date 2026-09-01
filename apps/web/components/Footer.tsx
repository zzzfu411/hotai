"use client";

import Link from "next/link";
import { useLang } from "./LangContext";

/** Legacy footer kept in the same Signal Press colophon language as AppShell. */
export function Footer() {
  const { lang } = useLang();
  const zh = lang === "zh";

  return (
    <footer className="kz-foot">
      <div className="kz-foot-inner">
        <p className="kz-foot-motto">SIGNAL, NOT NOISE.</p>
        <div className="kz-foot-note">
          <span>{zh ? "独立 AI 新闻信号台" : "Independent AI news signal desk"}</span>
          <nav className="kz-foot-links" aria-label={zh ? "页脚链接" : "Footer links"}>
            <Link href="/digest">{zh ? "简报" : "Digest"}</Link>
            <Link href="/search">{zh ? "搜索" : "Search"}</Link>
            <a href="/feed.xml">RSS</a>
          </nav>
        </div>
        <a className="kz-footer-link" href="https://yeuxark.com">
          ← yeuxark.com
        </a>
      </div>
    </footer>
  );
}
