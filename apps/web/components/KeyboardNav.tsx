"use client";

import { useEffect } from "react";

/** Story links on list pages, in reading order. */
const STORY_LINKS = ".kz-nook-link, .kz-article-main";

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName);
}

/**
 * Reader shortcuts: j / k step to the next / previous story on a list page
 * (Enter opens it, as on any focused link) and "/" jumps to search.
 */
export function KeyboardNav({ onSearch }: { onSearch: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || isTyping(event.target)) return;
      if (event.key === "/") {
        event.preventDefault();
        onSearch();
        return;
      }
      if (event.key !== "j" && event.key !== "k") return;
      const links = [...document.querySelectorAll<HTMLElement>(STORY_LINKS)].filter(
        (link) => link.getClientRects().length > 0,
      );
      if (links.length === 0) return;
      const current = links.indexOf(document.activeElement as HTMLElement);
      // Without a focused story, start from the first one on screen.
      const next = current >= 0
        ? current + (event.key === "j" ? 1 : -1)
        : Math.max(0, links.findIndex((link) => link.getBoundingClientRect().bottom > 80));
      const target = links[next];
      if (!target) return;
      event.preventDefault();
      target.focus({ preventScroll: true });
      target.scrollIntoView({ block: "nearest" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onSearch]);

  return null;
}
