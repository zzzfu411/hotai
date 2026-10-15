"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { JuyaTocItem } from "@/lib/juya-shape";

type RailProps = {
  toc: JuyaTocItem[];
  dates: string[];
  current: string;
  zh: boolean;
};

/** The heading the reader is in: the last one above the top band of the viewport. */
function useActiveHeading(idList: string): string | null {
  const [active, setActive] = useState<string | null>(null);
  useEffect(() => {
    const ids = idList.split("\n").filter(Boolean);
    if (ids.length === 0) return;
    let frame = 0;
    const update = () => {
      frame = 0;
      // Below the sticky header, about where the eye starts reading.
      const line = Math.min(180, window.innerHeight * 0.3);
      let next: string | null = null;
      for (const id of ids) {
        const el = document.getElementById(id);
        if (!el) continue;
        if (el.getBoundingClientRect().top > line) break;
        next = id;
      }
      setActive(next);
    };
    const schedule = () => {
      if (!frame) frame = window.requestAnimationFrame(update);
    };
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    update();
    return () => {
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      window.cancelAnimationFrame(frame);
    };
  }, [idList]);
  return active;
}

function Contents({
  toc,
  active,
  zh,
  onPick,
  listRef,
}: {
  toc: JuyaTocItem[];
  active: string | null;
  zh: boolean;
  onPick?: () => void;
  listRef?: React.Ref<HTMLOListElement>;
}) {
  return (
    <nav className="kz-juya-toc" aria-label={zh ? "本期目录" : "Contents"}>
      <ol ref={listRef}>
        {toc.map((item) => (
          <li key={item.id} className={item.level === 3 ? "is-story" : "is-section"}>
            <a href={`#${item.id}`} aria-current={active === item.id ? "location" : undefined} onClick={onPick}>
              {item.n != null ? <span className="kz-juya-toc-n">{item.n}</span> : null}
              <span className="kz-juya-toc-text">{item.text}</span>
              {item.count ? <span className="kz-juya-toc-count">{item.count}</span> : null}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function Editions({ dates, current, zh, onPick }: { dates: string[]; current: string; zh: boolean; onPick?: () => void }) {
  if (dates.length < 2) return null;
  return (
    <nav className="kz-juya-editions" aria-label={zh ? "往期" : "Editions"}>
      {dates.map((date) => (
        <Link
          key={date}
          href={`/juya?date=${date}`}
          className="kz-chip"
          aria-current={date === current ? "page" : undefined}
          onClick={onPick}
        >
          {date.slice(5)}
        </Link>
      ))}
    </nav>
  );
}

/**
 * Wide screens: a sticky rail with the editions and the issue's contents,
 * highlighting the section in view. Narrow screens: a floating button that
 * opens the same contents in a sheet.
 */
export function JuyaRail({ toc, dates, current, zh }: RailProps) {
  const active = useActiveHeading(toc.map((item) => item.id).join("\n"));
  const railList = useRef<HTMLOListElement>(null);
  const sheet = useRef<HTMLDialogElement>(null);

  // Keep the highlighted entry visible inside the rail's own scroll box.
  useEffect(() => {
    const list = railList.current;
    const box = list?.closest<HTMLElement>(".kz-juya-rail");
    if (!list || !box || !active || box.getClientRects().length === 0) return;
    const link = list.querySelector<HTMLElement>(`a[href="#${CSS.escape(active)}"]`);
    if (!link) return;
    const top = link.offsetTop - box.offsetTop;
    if (top < box.scrollTop + 48 || top > box.scrollTop + box.clientHeight - 64) {
      box.scrollTo({ top: Math.max(0, top - box.clientHeight / 3) });
    }
  }, [active]);

  const closeSheet = useCallback(() => sheet.current?.close(), []);

  return (
    <>
      <aside className="kz-juya-rail" aria-label={zh ? "往期与目录" : "Editions and contents"}>
        <p className="kz-juya-rail-label">{zh ? "往期" : "Editions"}</p>
        <Editions dates={dates} current={current} zh={zh} />
        {toc.length > 2 ? (
          <>
            <p className="kz-juya-rail-label">{zh ? "目录" : "Contents"}</p>
            <Contents toc={toc} active={active} zh={zh} listRef={railList} />
          </>
        ) : null}
      </aside>
      <button
        type="button"
        className="kz-juya-fab"
        aria-label={zh ? "目录与往期" : "Contents and editions"}
        onClick={() => {
          const box = sheet.current;
          if (!box) return;
          box.showModal();
          box.querySelector('[aria-current="location"]')?.scrollIntoView({ block: "center" });
        }}
      >
        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden>
          <path d="M3 5h14M3 10h14M3 15h9" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" fill="none" />
        </svg>
      </button>
      <dialog
        ref={sheet}
        className="kz-juya-sheet"
        aria-label={zh ? "目录与往期" : "Contents and editions"}
        onClick={(event) => {
          if (event.target === event.currentTarget) closeSheet();
        }}
      >
        <div className="kz-juya-sheet-head">
          <span>{zh ? "往期" : "Editions"}</span>
          <button type="button" className="kz-juya-sheet-close" onClick={closeSheet} aria-label={zh ? "关闭" : "Close"}>
            ×
          </button>
        </div>
        <Editions dates={dates} current={current} zh={zh} onPick={closeSheet} />
        {toc.length > 2 ? (
          <>
            <p className="kz-juya-rail-label">{zh ? "目录" : "Contents"}</p>
            <Contents toc={toc} active={active} zh={zh} onPick={closeSheet} />
          </>
        ) : null}
      </dialog>
    </>
  );
}

/**
 * Opens or folds every story's full text at once. `available` comes from the
 * server so the button is in the first paint rather than appearing later.
 */
export function JuyaExpandAll({ zh, available }: { zh: boolean; available: boolean }) {
  const [allOpen, setAllOpen] = useState(false);
  const [present, setPresent] = useState(available);

  useEffect(() => {
    const body = document.querySelector(".kz-juya-body");
    if (!body) return;
    const sync = () => {
      const all = [...body.querySelectorAll<HTMLDetailsElement>("details.kz-juya-more")];
      setPresent(all.length > 0);
      setAllOpen(all.length > 0 && all.every((d) => d.open));
    };
    sync();
    // `toggle` does not bubble; listen in the capture phase.
    body.addEventListener("toggle", sync, true);
    return () => body.removeEventListener("toggle", sync, true);
  }, []);

  if (!present) return null;
  return (
    <button
      type="button"
      className="kz-juya-expand"
      aria-pressed={allOpen}
      onClick={() => {
        const next = !allOpen;
        for (const d of document.querySelectorAll<HTMLDetailsElement>(".kz-juya-body details.kz-juya-more")) {
          d.open = next;
        }
        setAllOpen(next);
      }}
    >
      {allOpen ? (zh ? "收起全文" : "Fold all") : zh ? "展开全文" : "Expand all"}
    </button>
  );
}

/** Story images open full size in a lightbox; the link still works without JS. */
export function JuyaLightbox({ zh }: { zh: boolean }) {
  const box = useRef<HTMLDialogElement>(null);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    const body = document.querySelector(".kz-juya-body");
    if (!body) return;
    const onClick = (event: Event) => {
      const mouse = event as MouseEvent;
      if (mouse.button !== 0 || mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.altKey) return;
      const link = (event.target as HTMLElement | null)?.closest<HTMLAnchorElement>(".kz-juya-imgs a");
      if (!link) return;
      event.preventDefault();
      setSrc(link.href);
      box.current?.showModal();
    };
    body.addEventListener("click", onClick);
    return () => body.removeEventListener("click", onClick);
  }, []);

  return (
    <dialog
      ref={box}
      className="kz-juya-lightbox"
      aria-label={zh ? "查看图片" : "Image"}
      onClick={() => box.current?.close()}
      onClose={() => setSrc(null)}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- remote feed image, never optimised */}
      {src ? <img src={src} alt="" /> : null}
    </dialog>
  );
}
