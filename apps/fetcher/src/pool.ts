/** Bounded-concurrency map. JS is single-threaded so the cursor increment is safe. */
export async function mapPool<T, R>(items: T[], n: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const ret: R[] = new Array(items.length);
  let cursor = 0;
  const worker = async () => {
    for (;;) {
      const idx = cursor++;
      if (idx >= items.length) return;
      ret[idx] = await fn(items[idx]!);
    }
  };
  const size = Math.max(1, Math.min(n, items.length));
  await Promise.all(Array.from({ length: size }, () => worker()));
  return ret;
}
