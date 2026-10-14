"use client";

import { useLinkStatus } from "next/link";

/**
 * Rendered inside a <Link>: lights up while that navigation waits on the
 * server, so a tap answers at once. A route-level loading.tsx would also
 * answer at once, but React then holds the real page back behind its
 * skeleton for at least 300 ms, which measured slower on every route.
 */
export function LinkPending() {
  const { pending } = useLinkStatus();
  return <span aria-hidden className={pending ? "kz-link-pending is-pending" : "kz-link-pending"} />;
}
