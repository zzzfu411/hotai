import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ReaderBody } from "@/components/Reader";
import { hostname } from "@/lib/format";
import { CATALOG_BY_ID } from "@/lib/catalog";
import { parsePublicHttpUrl, UnsafeUrlError } from "@/lib/ssrf";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{ url?: string; title?: string; summary?: string; src?: string }>;
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
  const title = (resolved.title ?? "").trim() || (url ? hostname(url.href) : "阅读");
  return { title, robots: { index: false, follow: true } };
}

export default async function RemoteReaderPage({ searchParams }: PageProps) {
  const resolved = await searchParams;
  const url = safeUrl(resolved.url);
  if (!url) notFound();

  const title = (resolved.title ?? "").trim() || hostname(url.href);
  const fallbackSummary = (resolved.summary ?? "").trim().slice(0, 400);
  const src = resolved.src ? CATALOG_BY_ID.get(resolved.src) : undefined;
  const host = hostname(url.href);

  return (
    <article className="ha-reader">
      <header className="ha-reader-head">
        <p className="ha-reader-kicker">
          <Link href="/">{src ? src.name : "简报"}</Link>
          <span aria-hidden> · </span>
          <a href={url.href} target="_blank" rel="noopener noreferrer" className="ha-chip ha-host">
            {host}
          </a>
        </p>
        <h1 className="ha-reader-title">{title}</h1>
      </header>
      <ReaderBody url={url.href} fallbackSummary={fallbackSummary} />
    </article>
  );
}
