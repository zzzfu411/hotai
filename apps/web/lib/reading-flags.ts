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

function load(key: string): number[] {
  if (typeof window === "undefined") return [];
  try {
    return parseIdArray(window.localStorage.getItem(key));
  } catch {
    return [];
  }
}

function save(key: string, ids: number[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(ids));
  } catch {
    /* quota / private mode */
  }
}

export function isLater(id: number): boolean {
  return load(LATER_KEY).includes(id);
}

export function isRead(id: number): boolean {
  return load(READ_KEY).includes(id);
}

/** Returns whether the id is in later-read after the toggle. */
export function toggleLater(id: number): boolean {
  const later = load(LATER_KEY);
  if (later.includes(id)) {
    save(LATER_KEY, removeId(later, id));
    return false;
  }
  save(LATER_KEY, addId(later, id));
  save(READ_KEY, removeId(load(READ_KEY), id));
  return true;
}

/** Returns whether the id is in read after the toggle. */
export function toggleRead(id: number): boolean {
  const read = load(READ_KEY);
  if (read.includes(id)) {
    save(READ_KEY, removeId(read, id));
    return false;
  }
  save(READ_KEY, addId(read, id));
  save(LATER_KEY, removeId(load(LATER_KEY), id));
  return true;
}
