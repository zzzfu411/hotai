import type { Source } from "@hotai/db";
import type { Signals } from "./scoring.js";

export type RawItem = {
  url: string;
  title: string;
  summary?: string | null;
  author?: string | null;
  publishedAt: Date;
  tags?: string[];
  signals?: Signals;
  raw?: unknown;
};

export type Fetcher = (source: Source) => Promise<RawItem[]>;
