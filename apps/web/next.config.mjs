import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/** Load repo-root `.env` so Prisma sees DATABASE_URL when cwd is apps/web. */
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const envFile = resolve(repoRoot, ".env");
if (existsSync(envFile)) {
  for (const raw of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 1) continue;
    const key = line.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Production data queries can be slow while the small VPS is also serving
  // traffic. Give ISR page generation enough time during deploy builds.
  staticPageGenerationTimeout: 180,
  transpilePackages: ["@hotai/db", "@hotai/ai"],
  experimental: {
    serverComponentsExternalPackages: [
      "@prisma/client",
      "@anthropic-ai/sdk",
      "@mozilla/readability",
      "linkedom",
      "isomorphic-dompurify",
      "jsdom",
      "rss-parser",
      "undici",
    ],
  },
  // packages/ai and packages/db are ESM with explicit `.js` extensions on
  // intra-package imports (required by tsx/Node ESM), but the files on disk
  // are `.ts` — teach webpack to resolve `./client.js` -> `./client.ts`.
  webpack: (config) => {
    config.resolve.extensionAlias = { ".js": [".ts", ".tsx", ".js"] };
    return config;
  },
};
export default nextConfig;
