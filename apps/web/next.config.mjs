
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/lib/i18n.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  outputFileTracingIncludes: {
    '/**/*': [
      '../../node_modules/.pnpm/@prisma+client@5.22.0_prisma@5.22.0/node_modules/.prisma/client/**',
    ],
  },

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

  serverExternalPackages: ['bullmq', 'ioredis'],

  webpack(config, { isServer }) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      '.js': ['.ts', '.tsx', '.js'],
    };

    config.resolve.alias = {
      ...config.resolve.alias,
      '@valkey/valkey-glide': false,
    };

    return config;
  },

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
