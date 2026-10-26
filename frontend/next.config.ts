import type { NextConfig } from 'next';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const SHARED_ENV = ['API_INTERNAL_URL', 'FRONTEND_URL', 'NEXT_PUBLIC_COLLAB_URL'] as const;

const rootEnv = new URL('../.env', import.meta.url);
if (existsSync(rootEnv)) {
  const values = parseEnv(readFileSync(rootEnv, 'utf8'));
  for (const key of SHARED_ENV) {
    process.env[key] ??= values[key];
  }
}

const apiUrl = process.env.API_INTERNAL_URL ?? 'http://localhost:4000';

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  poweredByHeader: false,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
  rewrites: async () => [{ source: '/api/:path*', destination: `${apiUrl}/api/:path*` }],
};

export default nextConfig;
