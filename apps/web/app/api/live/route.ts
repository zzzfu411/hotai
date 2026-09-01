import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Process liveness only; deliberately performs no database or provider I/O. */
export function GET() {
  return NextResponse.json(
    { ok: true, status: "live", checkedAt: new Date().toISOString() },
    { headers: { "cache-control": "no-store" } },
  );
}
