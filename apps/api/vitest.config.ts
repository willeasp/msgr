import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    // Load the same (CommonJS) graphql build that @graphql-tools and Apollo
    // load at runtime; two copies of graphql cannot share a schema.
    alias: { graphql: 'graphql/index.js' },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // `nx test` runs plain `vitest`, which watches forever in a terminal.
    // Run once by default; opt into watching with `--watch`.
    watch: false,
  },
});
