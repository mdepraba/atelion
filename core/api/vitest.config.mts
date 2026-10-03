import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../node_modules/.vite/core/api',
  test: {
    name: '@core/api',
    watch: false,
    globals: true,
    environment: 'node',
    include: ['src/**/*.{test,spec}.{ts}'],
    passWithNoTests: true,
    reporters: ['default'],
    coverage: {
      reportsDirectory: './test-output/vitest/coverage',
      provider: 'v8',
    },
  },
});
