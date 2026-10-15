/**
 * Runs once when the server starts. Node-only warm-ups live in
 * `instrumentation-node.ts`; the guarded import keeps them out of the edge build.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
