import { NextResponse } from "next/server";
import { collectHealthSnapshotCached } from "@/lib/health";
import { catalogHealth } from "@/lib/catalog-health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Database and content-pipeline readiness with aggregate diagnostics. */
export async function GET() {
  try {
    const snapshot = await collectHealthSnapshotCached();
    return NextResponse.json(snapshot, {
      status: snapshot.ready ? 200 : 503,
      headers: { "cache-control": "no-store" },
    });
  } catch (error) {
    console.error(
      "[health] snapshot unavailable:",
      error instanceof Error ? error.message.slice(0, 300) : "unknown database error",
    );
    return NextResponse.json(
      {
        ok: false,
        ready: false,
        status: "unavailable",
        checkedAt: new Date().toISOString(),
        database: { ok: false },
        catalog: catalogHealth(),
        warnings: ["database-unavailable"],
      },
      { status: 503, headers: { "cache-control": "no-store", "retry-after": "5" } },
    );
  }
}
