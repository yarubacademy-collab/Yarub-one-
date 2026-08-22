import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@yarub/shared': resolve(__dirname, 'packages/shared/src/index.ts'),
      '@yarub/providers': resolve(__dirname, 'packages/providers/src/index.ts'),
      '@yarub/ai-core': resolve(__dirname, 'packages/ai-core/src/index.ts'),
      '@yarub/config': resolve(__dirname, 'packages/config/src/index.ts'),
    },
  },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
