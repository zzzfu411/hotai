/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@hotai/db", "@hotai/ai"],
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "@anthropic-ai/sdk"],
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
