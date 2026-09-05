// Explicit synthetic probe; no model requests. Uses normal public rate limiting.
const base = process.env.SMOKE_BASE_URL || "http://127.0.0.1:3000";
const ids = (process.env.SMOKE_CATALOG_IDS || "hn,bbc-tech").split(",").filter(Boolean);
try {
  if (!ids.length) throw new Error("At least one catalog ID is required");
  const response = await fetch(new URL("/api/catalog/pull", base), {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ ids }), signal: AbortSignal.timeout(45_000),
  });
  if (!response.ok) throw new Error(`catalog HTTP ${response.status}`);
  const body = await response.json();
  const sources = body.sources ?? [];
  const usable = sources.filter(s => s.ok && !s.stale && s.items?.length > 0);
  console.log(JSON.stringify({ checkedAt: new Date().toISOString(), requested: ids, freshSources: usable.map(s => s.id), sources: sources.map(s => ({ id: s.id, ok: s.ok, stale: s.stale, items: s.items?.length ?? 0, error: s.error })), ready: usable.length > 0 }));
  if (usable.length === 0) process.exitCode = 1;
} catch (error) { console.error(error instanceof Error ? error.message : "probe failed"); process.exitCode = 1; }
