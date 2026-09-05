import { serverLang } from "@/lib/server-lang";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ReaderBody, ReadingFlags } from "@/components/Reader";
import { hostname } from "@/lib/format";
import { CATALOG_BY_ID } from "@/lib/catalog";
import { parsePublicHttpUrl, UnsafeUrlError } from "@/lib/ssrf";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ url?: string; title?: string; summary?: string; src?: string; source?: string }>;
};

function safeUrl(raw: string | undefined): URL | null {
  if (!raw) return null;
  try {
    return parsePublicHttpUrl(raw);
  } catch (err) {
    if (err instanceof UnsafeUrlError) return null;
    return null;
  }
}

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const resolved = await searchParams;
  const url = safeUrl(resolved.url);
  const title = (resolved.title ?? "").trim().slice(0, 300) || (url ? hostname(url.href) : "阅读");
  return { title, robots: { index: false, follow: true } };
}

export default async function RemoteReaderPage({ searchParams }: PageProps) {
  const zh = (await serverLang()) === "zh";
  const resolved = await searchParams;
  const url = safeUrl(resolved.url);
  if (!url) notFound();

  const title = (resolved.title ?? "").trim().slice(0, 300) || hostname(url.href);
  const fallbackSummary = (resolved.summary ?? "").trim().slice(0, 400);
  const src = resolved.src ? CATALOG_BY_ID.get(resolved.src) : undefined;
  const host = hostname(url.href);

  return (
    <article className="kz-reader">
      <header className="kz-reader-head">
        <p className="kz-reader-kicker">
          <Link href="/">{src ? src.name : (zh ? "速闻" : "Feed")}</Link>
          <span aria-hidden> · </span>
          <a href={url.href} target="_blank" rel="noopener noreferrer" className="kz-chip kz-host">
            {host}
          </a>
        </p>
        <h1 className="kz-reader-title">{title}</h1>
        <ReadingFlags story={{ url: url.href, title, summary: fallbackSummary, source: src?.name ?? resolved.source?.slice(0, 100) ?? host }} />
      </header>
      <ReaderBody url={url.href} fallbackSummary={fallbackSummary} />
    </article>
  );
}
