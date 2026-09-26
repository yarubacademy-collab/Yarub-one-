import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/lib/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ['bullmq', 'ioredis'],

  // Workspace packages ship TypeScript source rather than a build step, so
  // Next must compile them itself.
  transpilePackages: [
    '@yarub/shared',
    '@yarub/config',
    '@yarub/providers',
    '@yarub/ai-core',
    '@yarub/sandbox',
    '@yarub/storage',
    '@yarub/documents',
    '@yarub/billing',
    '@yarub/db',
  ],

  // BullMQ can speak to Valkey as well as Redis, so it references
  // @valkey/valkey-glide. That package is an optional peer and is not
  // installed here; without this line Next tries to bundle it and the build
  // fails on a dependency the job queue never actually uses over ioredis.
  serverExternalPackages: ['bullmq', 'ioredis'],

  webpack(config, { isServer }) {
    // ESM requires explicit .js specifiers in TypeScript source. Webpack
    // resolves those back to the .ts files they were written in.
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };

    // Same reason as above: keep the optional Valkey client out of the bundle
    // on both the server and the client build.
    config.resolve.alias = {
      ...config.resolve.alias,
      '@valkey/valkey-glide': false,
    };

    return config;
  },
  // Generated code never runs here; it is served from PREVIEW_ORIGIN.
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'DENY' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(self), geolocation=(), payment=()',
          },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
