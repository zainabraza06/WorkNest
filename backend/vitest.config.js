import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./tests/setup.js'],
    fileParallelism: false,
    coverage: {
      provider: 'v8',
      include: ['src/**/*.js'],
      exclude: ['src/scripts/**', 'src/server.js'],
      reporter: ['text-summary', 'lcov'],
      // A floor, not a target: it stops coverage silently eroding as features land
      thresholds: { lines: 80, statements: 78, functions: 75, branches: 60 },
    },
    testTimeout: 30_000,
    hookTimeout: 120_000,
    env: {
      NODE_ENV: 'test',
      MONGODB_URI: 'mongodb://placeholder-overridden-by-memory-server',
      JWT_SECRET: 'test-secret-that-is-long-enough',
      // Tests exercise the fallback paths; AI-specific tests mock the client directly
      AI_ENABLED: 'false',
    },
  },
});
