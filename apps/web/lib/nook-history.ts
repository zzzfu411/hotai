export const NOOK_PAGE_SIZE = 24;

const HISTORY_FIELD = "__hotaiNookFeed";
const SNAPSHOT_VERSION = 1;
const MAX_AGE_MS = 12 * 60 * 60 * 1000;
const MAX_SHOWN = 2_000;
const MAX_SCROLL_Y = 10_000_000;
const MAX_ANCHOR_OFFSET = 10_000;
const MAX_KEY_LENGTH = 2_048;

export type NookHistorySnapshot = {
  version: typeof SNAPSHOT_VERSION;
  viewKey: string;
  shown: number;
  scrollY: number;
  anchorKey: string | null;
  anchorOffset: number;
  savedAt: number;
};

type SnapshotInput = {
  viewKey: string;
  shown: number;
  scrollY: number;
  anchorKey?: string | null;
  anchorOffset?: number;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function boundedInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}

function boundedKey(value: string): string {
  return value.slice(0, MAX_KEY_LENGTH);
}

export function createNookHistorySnapshot(
  input: SnapshotInput,
  now = Date.now(),
): NookHistorySnapshot {
  const anchorKey = input.anchorKey?.trim();
  return {
    version: SNAPSHOT_VERSION,
    viewKey: boundedKey(input.viewKey),
    shown: boundedInt(input.shown, NOOK_PAGE_SIZE, MAX_SHOWN),
    scrollY: finite(input.scrollY)
      ? Math.min(MAX_SCROLL_Y, Math.max(0, input.scrollY))
      : 0,
    anchorKey: anchorKey ? boundedKey(anchorKey) : null,
    anchorOffset: finite(input.anchorOffset)
      ? Math.min(MAX_ANCHOR_OFFSET, Math.max(-MAX_ANCHOR_OFFSET, input.anchorOffset))
      : 0,
    savedAt: finite(now) ? now : Date.now(),
  };
}

/** Preserve Next.js' private history fields while attaching this entry's feed progress. */
export function mergeNookHistoryState(
  historyState: unknown,
  snapshot: NookHistorySnapshot,
): Record<string, unknown> {
  return { ...(record(historyState) ?? {}), [HISTORY_FIELD]: snapshot };
}

/** Read only a recent snapshot belonging to the exact category/source view. */
export function readNookHistorySnapshot(
  historyState: unknown,
  viewKey: string,
  now = Date.now(),
): NookHistorySnapshot | null {
  const root = record(historyState);
  const value = record(root?.[HISTORY_FIELD]);
  if (!value || value.version !== SNAPSHOT_VERSION || value.viewKey !== viewKey) return null;
  if (!finite(value.savedAt) || value.savedAt > now + 60_000 || now - value.savedAt > MAX_AGE_MS) {
    return null;
  }
  if (
    !Number.isInteger(value.shown) ||
    (value.shown as number) < NOOK_PAGE_SIZE ||
    (value.shown as number) > MAX_SHOWN ||
    !finite(value.scrollY) ||
    value.scrollY < 0 ||
    value.scrollY > MAX_SCROLL_Y ||
    !finite(value.anchorOffset) ||
    Math.abs(value.anchorOffset) > MAX_ANCHOR_OFFSET
  ) {
    return null;
  }
  const anchorKey = value.anchorKey;
  if (
    anchorKey !== null &&
    (typeof anchorKey !== "string" || anchorKey.length === 0 || anchorKey.length > MAX_KEY_LENGTH)
  ) {
    return null;
  }
  return {
    version: SNAPSHOT_VERSION,
    viewKey,
    shown: value.shown as number,
    scrollY: value.scrollY,
    anchorKey,
    anchorOffset: value.anchorOffset,
    savedAt: value.savedAt,
  };
}

/** Expand by whole pages until a moved anchor is present in the rendered list. */
export function visibleCountForAnchor(
  shown: number,
  anchorIndex: number,
  totalItems: number,
): number {
  const total = Math.max(0, Math.trunc(totalItems));
  const current = boundedInt(shown, NOOK_PAGE_SIZE, MAX_SHOWN);
  if (total === 0 || !Number.isInteger(anchorIndex) || anchorIndex < 0) {
    return Math.min(total, current);
  }
  const needed = Math.ceil((anchorIndex + 1) / NOOK_PAGE_SIZE) * NOOK_PAGE_SIZE;
  return Math.min(total, Math.max(current, needed));
}
