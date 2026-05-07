import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Pin the workspace root so Turbopack stops picking up the stray
  // /Users/danielforce/package-lock.json upstream.
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
