import type { NextConfig } from 'next';

// The console talks to the orchestrator through this same origin, so no CORS is needed.
const orchestrator = process.env.ORCHESTRATOR_URL ?? 'http://127.0.0.1:3011';

const nextConfig: NextConfig = {
  poweredByHeader: false,
  rewrites() {
    return Promise.resolve([
      { source: '/api/orchestrator/:path*', destination: `${orchestrator}/:path*` },
    ]);
  },
};

export default nextConfig;
