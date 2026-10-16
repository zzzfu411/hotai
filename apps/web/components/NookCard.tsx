"use client";

import Link from "next/link";
import { memo, useState } from "react";
import type { TimelineItem } from "@/lib/nook-merge";
import { readerLink } from "@/lib/reader-link";
import { displayStory } from "@/lib/story-text";
import { LinkPending } from "./LinkPending";
import { ReadingBadge } from "./ReadingList";
import { TimeAgo } from "./TimeAgo";

function readerHref(item: TimelineItem): string {
  return readerLink({
    ...item,
    source: item.sourceName,
    articleId: item.sourceId === "hotai-feed" ? item.articleId : undefined,
  });
}

const Cover = memo(function Cover({ src, className, eager }: { src: string; className: string; eager?: boolean }) {
  const [ok, setOk] = useState(true);
  if (!ok) return null;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      className={className}
      src={src}
      alt=""
      loading={eager ? "eager" : "lazy"}
      fetchPriority={eager ? "high" : undefined}
      decoding="async"
      referrerPolicy="no-referrer"
      onError={() => setOk(false)}
    />
  );
});

/** One story row of the live timeline; the first row is the lead. */
export const NookCard = memo(function NookCard({
  item,
  lang,
  lead,
  compact,
  onOpen,
}: {
  item: TimelineItem;
  lang: "zh" | "en";
  lead?: boolean;
  /** Compact rows hide the summary; it stays available on hover. */
  compact: boolean;
  onOpen: (anchorKey: string) => void;
}) {
  const story = displayStory(item);
  const source = story.publisher ?? item.sourceName;
  // A headline with no summary or picture is short; wide layouts give it
  // fewer sidebar rows so it doesn't sit above an empty block.
  const className = lead
    ? story.summary || item.image ? "kz-nook-item kz-nook-lead" : "kz-nook-item kz-nook-lead is-bare"
    : "kz-nook-item";
  return (
    <li className={className} data-nook-key={item.url}>
      {/* Story pages render per request, so prefetching every visible row
          only adds server hits that compete with the tap. The lead alone
          prefetches in full, which also loads the reader route's code that
          every other row then shares. */}
      <Link
        href={readerHref({ ...item, title: story.title, summary: story.summary, sourceName: source })}
        prefetch={lead ? true : false}
        className="kz-nook-link"
        title={compact && !lead && story.summary ? story.summary : undefined}
        onNavigate={() => onOpen(item.url)}
      >
        <div className="kz-nook-copy">
          <h2 className="kz-nook-item-title">{story.title}</h2>
          <p className="kz-nook-item-meta">
            <span className="kz-source-mark" title={story.publisher ? `${story.publisher} · ${item.sourceName}` : undefined}>
              {source}
            </span>
            <TimeAgo iso={item.publishedAt} lang={lang} />
            <ReadingBadge story={{ ...item, source }} />
          </p>
          {story.summary ? <p className="kz-nook-item-sum">{story.summary}</p> : null}
        </div>
        {item.image ? <Cover src={item.image} className={lead ? "kz-nook-cover" : "kz-nook-thumb"} eager={lead} /> : null}
        <LinkPending />
      </Link>
    </li>
  );
});
