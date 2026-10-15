import { loadJuyaIssues } from "./lib/juya";

// Fill the Juya feed cache in the background so the first /juya visit after a
// deploy does not wait on the feed. Readiness is not delayed, and a failed
// fetch is simply retried on the next request.
void loadJuyaIssues().catch(() => {});
