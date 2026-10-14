"use client";

import { useState, useSyncExternalStore } from "react";
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

const faviconUrl = (host: string, size: number) =>
  `https://www.google.com/s2/favicons?sz=${size * 2}&domain=${encodeURIComponent(host)}`;

/*
 * Google's favicon service is unreachable on many networks in mainland China,
 * where each icon request hangs until it times out and keeps the page loading.
 * Pages therefore render monograms first; once the page has loaded, one probe
 * checks the service and real icons swap in only if it answers. The result
 * lasts for the browser session.
 */
type Reach = "unknown" | "ok" | "blocked";
const REACH_KEY = "hotai-favicon-reach";
const PROBE_TIMEOUT_MS = 2500;
let reach: Reach = "unknown";
let probing = false;
const listeners = new Set<() => void>();

function settle(next: Reach) {
  reach = next;
  try {
    sessionStorage.setItem(REACH_KEY, next);
  } catch {
    // Session storage can be unavailable; the probe simply runs again next page.
  }
  listeners.forEach((fn) => fn());
}

function probe() {
  if (probing || reach !== "unknown") return;
  probing = true;
  const img = new Image();
  const timer = window.setTimeout(() => settle("blocked"), PROBE_TIMEOUT_MS);
  img.onload = () => {
    window.clearTimeout(timer);
    if (reach === "unknown") settle("ok");
  };
  img.onerror = () => {
    window.clearTimeout(timer);
    if (reach === "unknown") settle("blocked");
  };
  img.referrerPolicy = "no-referrer";
  img.src = faviconUrl("google.com", 16);
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  if (reach === "unknown") {
    try {
      const saved = sessionStorage.getItem(REACH_KEY);
      if (saved === "ok" || saved === "blocked") reach = saved;
    } catch {
      // Fall through to the probe.
    }
  }
  if (reach === "unknown") {
    // After load, so a hanging probe never holds the page's load event.
    if (document.readyState === "complete") window.setTimeout(probe, 0);
    else window.addEventListener("load", () => window.setTimeout(probe, 0), { once: true });
  } else {
    queueMicrotask(onChange);
  }
  return () => listeners.delete(onChange);
}

function useFaviconsReachable(): boolean {
  return useSyncExternalStore(subscribe, () => reach === "ok", () => false);
}

/**
 * Site favicon via Google's favicon service, with a monogram until the
 * service is known to be reachable, and whenever an icon fails to load.
 */
export function SiteIcon({ url, size = 16, label }: { url: string; size?: number; label?: string }) {
  const host = hostOf(url);
  const reachable = useFaviconsReachable();
  const [failed, setFailed] = useState(false);
  if (!host || failed || !reachable) {
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
      src={faviconUrl(host, size)}
      width={size}
      height={size}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
    />
  );
}
