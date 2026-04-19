import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@shared': path.resolve(__dirname, './shared'),
    },
  },
  test: {
    globals: true,
    environment: 'node',
    include: ['server/tests/**/*.test.ts'],
    testTimeout: 30000,
  },
});
