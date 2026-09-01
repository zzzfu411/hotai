import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { asJsonRecord, readJsonBody } from "@/lib/request";

const ALLOWED_PATHS = new Set(["/", "/hot", "/digest", "/feed.xml", "/feed.json"]);
const MAX_PATHS = 20;

export async function POST(req: Request) {
  const secret = req.headers.get("x-revalidate-secret");
  if (!process.env.REVALIDATE_SECRET || secret !== process.env.REVALIDATE_SECRET) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const parsed = await readJsonBody<{ paths?: unknown }>(req, 8 * 1024);
  if (!parsed.ok) return NextResponse.json({ ok: false, error: parsed.error }, { status: parsed.status });
  const body = asJsonRecord(parsed.value);
  if (!body) return NextResponse.json({ ok: false, error: "invalid JSON object" }, { status: 400 });
  const requested = Array.isArray(body.paths) ? body.paths : ["/"];
  if (
    requested.length === 0 ||
    requested.length > MAX_PATHS ||
    !requested.every((p): p is string => typeof p === "string" && ALLOWED_PATHS.has(p))
  ) {
    return NextResponse.json({ ok: false, error: "invalid revalidation path" }, { status: 400 });
  }
  const paths = [...new Set(requested)];
  for (const p of paths) revalidatePath(p);
  return NextResponse.json({ ok: true, revalidated: paths });
}
