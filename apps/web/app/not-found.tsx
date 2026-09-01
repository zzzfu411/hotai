"use client";

import Link from "next/link";
import { useLang } from "@/components/LangContext";

export default function NotFound() {
  const { lang } = useLang();
  const zh = lang === "zh";

  return (
    <div className="ha-page ha-404">
      <p className="ha-404-mark" aria-hidden>
        404
      </p>
      <h1 className="ha-page-title">{zh ? "没有这页" : "No such page"}</h1>
      <p className="ha-page-lede">
        {zh
          ? "链接坏了，或者这篇文章已经超过 14 天被清掉了。"
          : "Broken link, or the story aged out of the 14-day window."}
      </p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        className="ha-404-art"
        src="/404-flameout.svg"
        alt=""
        width={320}
        height={240}
      />
      <Link href="/" className="ha-btn ha-404-back">
        {zh ? "← 回简报" : "← Back to briefing"}
      </Link>
    </div>
  );
}
