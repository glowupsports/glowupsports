import { defineConfig } from 'vitest/config';
import path from 'node:path';
export default defineConfig({
  resolve: { alias: {
    '@shared': path.resolve(__dirname, './shared'),
    '@': path.resolve(__dirname, './client'),
    'react-native': path.resolve(__dirname, './client/components/__tests__/__mocks__/react-native.ts'),
    'react-native-safe-area-context': path.resolve(__dirname, './client/components/__tests__/__mocks__/react-native-safe-area-context.ts'),
    '@expo/vector-icons/Feather': path.resolve(__dirname, './client/components/__tests__/__mocks__/feather.ts'),
    'expo-linear-gradient': path.resolve(__dirname, './client/components/__tests__/__mocks__/expo-linear-gradient.ts'),
  } },
  test: { globals: true, environment: 'node', include: ['client/components/__tests__/UpdateSheet.test.tsx'] },
});
