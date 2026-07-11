import { NextResponse } from "next/server";
import { getTodayDigestRow } from "@/lib/queries";

export const revalidate = 600;

/** GET /api/digest — JSON payload of today's brief (if any). */
export async function GET() {
  const d = await getTodayDigestRow();
  if (!d) return NextResponse.json({ ok: false, reason: "not-yet" }, { status: 404 });
  return NextResponse.json({
    ok: true,
    date: d.date.toISOString().slice(0, 10),
    headline: d.headline,
    overview: d.overview,
    themes: d.themes,
    bullets: d.bullets,
    model: d.model,
    generatedAt: d.createdAt.toISOString(),
  });
}
