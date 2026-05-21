import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const revalidate = 600;

/** GET /api/digest — JSON payload of today's brief (if any). */
export async function GET() {
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const d = await prisma.digest.findUnique({ where: { date: today } });
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
