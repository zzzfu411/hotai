/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@hotai/db", "@hotai/ai"],
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client", "@anthropic-ai/sdk"],
  },
};
export default nextConfig;
