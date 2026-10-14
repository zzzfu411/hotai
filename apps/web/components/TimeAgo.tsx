import { timeAgo } from "@/lib/format";

/**
 * Relative time stamp. Server and browser clocks differ by the request
 * latency, so a minute boundary can flip between them; the server text is a
 * fine answer for that case and is kept without a hydration error.
 */
export function TimeAgo({ iso, lang }: { iso: string | null | undefined; lang: "zh" | "en" }) {
  if (!iso) return null;
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return null;
  return (
    <time dateTime={iso} suppressHydrationWarning>
      {timeAgo(date, lang)}
    </time>
  );
}
