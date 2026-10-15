"use client";

import { useEffect, useRef } from "react";

/**
 * A thin accent bar along the top edge of a story page that fills as the
 * story is read. It tracks the `.kz-reader` article up to its related list,
 * and follows the body as the extracted text arrives and the page grows.
 */
export function ReadingProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    const article = bar?.closest<HTMLElement>(".kz-reader") ?? document.querySelector<HTMLElement>(".kz-reader");
    if (!bar || !article) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      const top = article.getBoundingClientRect().top + window.scrollY;
      const related = article.querySelector<HTMLElement>(".kz-reader-related");
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
  }, []);

  return (
    <div className="kz-read-progress" aria-hidden>
      <div ref={barRef} />
    </div>
  );
}
