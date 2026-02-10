import { defineConfig } from 'vitest/config';
import { resolve } from 'path';

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    env: {
      NEXT_PUBLIC_CONVEX_URL: 'https://test.convex.cloud',
      GOOGLE_GENERATIVE_AI_API_KEY: 'test-key',
      NEXT_PUBLIC_STACK_PROJECT_ID: 'stack-project',
      NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY: 'stack-client',
      STACK_SECRET_SERVER_KEY: 'stack-secret',
      INTEGRATION_TOKEN_SECRET: '12345678901234567890123456789012',
    },
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, './'),
      // Mock server-only to prevent errors in test environment
      'server-only': resolve(__dirname, './__mocks__/server-only.ts'),
    },
  },
});