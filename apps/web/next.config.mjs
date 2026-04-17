/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@hotai/db"],
  experimental: {
    serverComponentsExternalPackages: ["@prisma/client"],
  },
};
export default nextConfig;
