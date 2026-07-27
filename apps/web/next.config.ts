import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Required for apps/web/Dockerfile — bundles server + minimal node_modules
  // into .next/standalone instead of shipping the full node_modules tree.
  output: 'standalone',
};

export default nextConfig;
