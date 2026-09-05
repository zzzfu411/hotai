import { defineConfig } from "vitest/config";
import { resolve } from "node:path";

export default defineConfig({
  resolve: { alias: { "@": resolve("apps/web") } },
  test: {
    maxWorkers: 2,
    minWorkers: 1,
    environment: "node",
    include: ["apps/**/src/**/*.test.ts", "packages/**/src/**/*.test.ts", "apps/web/**/*.test.ts"],
  },
});
