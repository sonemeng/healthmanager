import type { NextConfig } from 'next';
import path from 'node:path';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../..'),
  transpilePackages: [
    '@openvitals/common',
    '@openvitals/database',
    '@openvitals/blob-storage',
    '@openvitals/ai',
    '@openvitals/events',
    '@openvitals/sharing',
  ],
};

export default nextConfig;
