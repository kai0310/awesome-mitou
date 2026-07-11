import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html'],
      include: ['src/**/*.ts'],
      exclude: ['src/cli/main.ts', 'src/**/*.d.ts'],
      thresholds: {
        'src/core/**': {
          lines: 90,
          branches: 85,
          functions: 90,
          statements: 90,
        },
      },
    },
  },
});
