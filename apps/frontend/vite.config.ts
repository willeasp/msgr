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
  server: {
    port: 4200,
    host: 'localhost',
  },
  preview: {
    port: 4200,
    host: 'localhost',
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
};

export default config;
