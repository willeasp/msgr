/// <reference types='vitest' />

// Synchronous plain-object Vite config with NO top-level imports.
// Nx/other tooling that introspects the project graph can safely require() this file.
//
// Note: Plugin integrations (like @vitejs/plugin-react) are intentionally omitted here
// because importing them at the top-level can trigger ESM/CJS interop errors during
// project graph processing. If you need to enable plugins for normal dev/build runs,
// load them dynamically in a separate runtime entry or switch to a runtime-only
// config loader that uses dynamic import() when starting the dev server.
const config = {
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/frontend',
  // The shared lib's source, so the app never waits for its build.
  resolve: {
    alias: { '@msgr/bitmap': `${__dirname}/../../libs/bitmap/src/index.ts` },
  },
  server: {
    port: 4200,
    host: 'localhost',
    // Same address as production: the API answers under /graphql.
    proxy: {
      '/graphql': { target: 'http://localhost:4000', ws: true },
    },
  },
  preview: {
    port: 4200,
    host: 'localhost',
  },
  css: {
    modules: {
      // Readable, stable class names: `srcl-Button__root` for the vendored
      // Sacred components, which src/skin.css restyles, `ChatListItem__item`
      // for the app's own.
      generateScopedName: (local: string, filename: string) => {
        const file = filename.split('?')[0] ?? filename;
        const name = (file.split('/').pop() ?? '').replace(
          /\.module\.css$/,
          ''
        );
        return file.includes('/src/sacred/')
          ? `srcl-${name}__${local}`
          : `${name}__${local}`;
      },
    },
  },
  // Keep plugins empty so the file stays a synchronous plain object.
  // If you need plugin-react features (fast refresh, automatic runtime),
  // load the plugin dynamically when running Vite (outside of project-graph checks).
  plugins: [],
  build: {
    outDir: './dist',
    emptyOutDir: true,
    reportCompressedSize: true,
    commonjsOptions: {
      transformMixedEsModules: true,
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
    // Run once by default; opt into watching with `--watch`.
    watch: false,
  },
};

export default config;
