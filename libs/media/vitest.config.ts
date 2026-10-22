import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Run once by default; opt into watching with `--watch`.
    watch: false,
  },
});
