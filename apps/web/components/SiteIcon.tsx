"use client";

import { useState } from "react";
import { safeHttpUrl } from "@/lib/safe-url";

function hostOf(url: string): string {
  const safe = safeHttpUrl(url);
  if (!safe) return "";
  try {
    return new URL(safe).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

/**
 * Site favicon via Google's favicon service, with a monogram when the service
 * is unreachable (blocked networks) or the image fails to load.
 */
export function SiteIcon({ url, size = 16, label }: { url: string; size?: number; label?: string }) {
  const host = hostOf(url);
  const [failed, setFailed] = useState(false);
  if (!host || failed) {
    const letter = (label || host || "?").trim().slice(0, 1).toUpperCase();
    return (
      <span className="kz-site-icon kz-site-icon-fallback" style={{ width: size, height: size }} aria-hidden>
        {letter}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className="kz-site-icon"
      src={`https://www.google.com/s2/favicons?sz=${size * 2}&domain=${encodeURIComponent(host)}`}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
