import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ReaderBody } from "@/components/Reader";
import { hostname } from "@/lib/format";
import { CATALOG_BY_ID } from "@/lib/catalog";
import { parsePublicHttpUrl, UnsafeUrlError } from "@/lib/ssrf";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: { url?: string; title?: string; src?: string };
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

export function generateMetadata({ searchParams }: PageProps): Metadata {
  const url = safeUrl(searchParams.url);
  const title = (searchParams.title ?? "").trim() || (url ? hostname(url.href) : "阅读");
  return { title, robots: { index: false, follow: true } };
}

export default function RemoteReaderPage({ searchParams }: PageProps) {
  const url = safeUrl(searchParams.url);
  if (!url) notFound();

  const title = (searchParams.title ?? "").trim() || hostname(url.href);
  const src = searchParams.src ? CATALOG_BY_ID.get(searchParams.src) : undefined;
  const host = hostname(url.href);

  return (
    <article className="kz-reader">
      <header className="kz-reader-head">
        <p className="kz-reader-kicker">
          <Link href="/">{src ? src.name : "速闻"}</Link>
          <span aria-hidden> · </span>
          <a href={url.href} target="_blank" rel="noopener noreferrer" className="kz-chip kz-host">
            {host}
          </a>
        </p>
        <h1 className="kz-reader-title">{title}</h1>
      </header>
      <ReaderBody url={url.href} fallbackSummary="" />
    </article>
  );
}
