import { defineConfig } from 'vitest/config';
import path from 'path';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: [],
    env: {
      DATABASE_URL: 'postgresql://lifeos:lifeos_dev@localhost:5432/lifeos_test',
      REDIS_URL: 'redis://localhost:6379',
      JWT_SECRET: 'test-secret-at-least-32-characters-long-12345',
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/index.ts', 'src/db/schema/**'],
    },
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
});
