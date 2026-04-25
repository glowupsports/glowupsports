import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: [
      { find: '@shared', replacement: path.resolve(__dirname, './shared') },
      // Mocked native modules — only the alias `find` matches when a test file
      // statically imports these packages. Server tests don't import any of
      // them, so they're transparent to existing suites.
      {
        find: /^react-native$/,
        replacement: path.resolve(
          __dirname,
          './client/components/__tests__/__mocks__/react-native.ts',
        ),
      },
      {
        find: /^react-native-safe-area-context$/,
        replacement: path.resolve(
          __dirname,
          './client/components/__tests__/__mocks__/react-native-safe-area-context.ts',
        ),
      },
      {
        find: /^@expo\/vector-icons\/Feather$/,
        replacement: path.resolve(
          __dirname,
          './client/components/__tests__/__mocks__/feather.ts',
        ),
      },
      {
        find: /^expo-linear-gradient$/,
        replacement: path.resolve(
          __dirname,
          './client/components/__tests__/__mocks__/expo-linear-gradient.ts',
        ),
      },
      // `@/...` resolves into `client/` for the lone client-side test that
      // currently runs under vitest. Server tests never use this alias.
      { find: /^@\/(.*)$/, replacement: path.resolve(__dirname, './client/$1') },
    ],
  },
  test: {
    globals: true,
    environment: 'node',
    include: [
      'server/tests/**/*.test.ts',
      'client/components/__tests__/**/*.test.tsx',
    ],
    testTimeout: 30000,
  },
});
