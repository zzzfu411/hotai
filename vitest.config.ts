import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Workspace packages export compiled `dist/` for Node. CI runs `prisma generate`
 * but not `tsc`, so Vite cannot resolve `@hotai/db` / `@hotai/ai` from the
 * package entry. Point tests at source and map `.js` intra-package imports
 * to `.ts`, the same way Next webpack already does.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@hotai/db": fileURLToPath(new URL("./packages/db/src/index.ts", import.meta.url)),
      "@hotai/ai": fileURLToPath(new URL("./packages/ai/src/index.ts", import.meta.url)),
    },
    extensionAlias: {
      ".js": [".ts", ".tsx", ".js"],
    },
  },
  test: {
    environment: "node",
    include: ["apps/**/src/**/*.test.ts", "packages/**/src/**/*.test.ts", "apps/web/**/*.test.ts"],
  },
});
