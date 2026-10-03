import { defineConfig } from 'vitest/config';

export default defineConfig({
  root: import.meta.dirname,
  cacheDir: '../../../node_modules/.vite/modules/fiscus/api',
  test: {
    name: '@fiscus/api',
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
