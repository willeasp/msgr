import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Load the same (CommonJS) graphql build that @graphql-tools and Apollo
    // load at runtime; two copies of graphql cannot share a schema.
    alias: {
      graphql: 'graphql/index.js',
      // The shared lib's source, so tests never wait for its build.
      '@msgr/bitmap': fileURLToPath(
        new URL('../../libs/bitmap/src/index.ts', import.meta.url)
      ),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // `nx test` runs plain `vitest`, which watches forever in a terminal.
    // Run once by default; opt into watching with `--watch`.
    watch: false,
  },
});
