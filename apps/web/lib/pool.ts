/** Bounded-concurrency map. JS is single-threaded so the cursor increment is safe. */
export async function mapPool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  return mapPoolProgress(items, n, fn, () => {});
}

/** Bounded-concurrency map that reports each item as soon as it settles. */
export async function mapPoolProgress<T, R>(
  items: T[],
  n: number,
  fn: (t: T) => Promise<R>,
  onResult: (result: R, index: number) => void,
): Promise<R[]> {
  const ret: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= items.length) return;
      const result = await fn(items[idx]!);
      ret[idx] = result;
      onResult(result, idx);
    }
  };
  const size = Math.max(1, Math.min(n, items.length));
  await Promise.all(Array.from({ length: size }, () => worker()));
  return ret;
}
