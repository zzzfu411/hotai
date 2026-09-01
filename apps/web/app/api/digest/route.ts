import { NextResponse } from "next/server";
import { getTodayDigestRow } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** GET /api/digest — JSON payload of today's brief (if any). */
export async function GET() {
  try {
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
  } catch (err) {
    console.warn("[api/digest] db unavailable:", err instanceof Error ? err.message : err);
    return NextResponse.json(
      { ok: false, reason: "database-unavailable" },
      { status: 503 },
    );
  }
}
