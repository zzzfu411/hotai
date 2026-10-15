"use client";

import { useEffect, useRef } from "react";

/**
 * A thin accent bar along the top edge of a story page that fills as the
 * story is read. It tracks the `root` article (by default `.kz-reader`) up to
 * `end` when present, and follows the body as text arrives and the page grows.
 */
export function ReadingProgress({ root = ".kz-reader", end = ".kz-reader-related" }: { root?: string; end?: string }) {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    const article = bar?.closest<HTMLElement>(root) ?? document.querySelector<HTMLElement>(root);
    if (!bar || !article) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = article.getBoundingClientRect().top + window.scrollY;
      const related = article.querySelector<HTMLElement>(end);
      const bottom = related
        ? related.getBoundingClientRect().top + window.scrollY
        : article.getBoundingClientRect().bottom + window.scrollY;
      const span = bottom - top - window.innerHeight;
      const progress = span > 0 ? (window.scrollY - top) / span : 1;
      bar.style.transform = `scaleX(${Math.min(1, Math.max(0, progress))})`;
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    observer.observe(article);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.cancelAnimationFrame(frame);
    };
  }, [root, end]);

  return (
    <div className="kz-read-progress" aria-hidden>
      <div ref={barRef} />
    </div>
  );
}
