"use client";

import Link from "next/link";
import { useLang } from "@/components/LangContext";

export default function NotFound() {
  const { lang } = useLang();
  const zh = lang === "zh";

  return (
    <div className="kz-page kz-404">
      <p className="kz-404-mark" aria-hidden>
        404
      </p>
      <h1 className="kz-page-title">{zh ? "没有这页" : "No such page"}</h1>
      <p className="kz-page-lede">
        {zh
          ? "链接坏了，或者这篇文章已经超过 14 天被清掉了。"
          : "Broken link, or the story aged out of the 14-day window."}
      </p>
      <Link href="/" className="kz-btn kz-404-back">
        {zh ? "← 回速闻" : "← Back to feed"}
      </Link>
    </div>
  );
}
