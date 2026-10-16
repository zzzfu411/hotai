/**
 * A whole-number setting from the environment. Unset, blank or non-numeric
 * values use `fallback`; everything is clamped to [min, max] so a typo in
 * production cannot disable a guard or stall a lease.
 */
export function envInt(raw: string | undefined, fallback: number, min: number, max: number): number {
  const n = raw === undefined || raw.trim() === "" ? Number.NaN : Number(raw);
  const value = Number.isFinite(n) ? n : fallback;
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
