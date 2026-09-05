/** localStorage keys for later-read / read — never written to Postgres. */
export const LATER_KEY = "hotai.later";
export const READ_KEY = "hotai.read";

const CAP = 400;

export function parseIdArray(raw: string | null): number[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as unknown;
    if (!Array.isArray(v)) return [];
    const out: number[] = [];
    const seen = new Set<number>();
    for (const item of v) {
      const n =
        typeof item === "number" ? item : typeof item === "string" ? Number(item) : NaN;
      if (!Number.isInteger(n) || n < 1 || seen.has(n)) continue;
      seen.add(n);
      out.push(n);
    }
    return out;
  } catch {
    return [];
  }
}

export function addId(ids: number[], id: number, cap = CAP): number[] {
  const next = ids.filter((x) => x !== id);
  next.push(id);
  return next.length > cap ? next.slice(next.length - cap) : next;
}

export function removeId(ids: number[], id: number): number[] {
  return ids.filter((x) => x !== id);
}
