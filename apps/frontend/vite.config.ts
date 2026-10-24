/// <reference types='vitest' />

// A synchronous plain-object Vite config with no top-level imports, so Nx's
// project graph can read it; plugin packages are imported inside `plugins`,
// where Vite awaits them, since importing them at the top can trip ESM/CJS
// interop while the graph is built.
const config = {
  root: __dirname,
  cacheDir: '../../node_modules/.vite/apps/frontend',
  // The shared lib's source, so the app never waits for its build.
  resolve: {
    alias: { '@msgr/media': `${__dirname}/../../libs/media/src/index.ts` },
  },
  server: {
    port: 4200,
    host: 'localhost',
    // Same address as production: the API answers under /graphql.
    proxy: {
      '/graphql': { target: 'http://localhost:4000', ws: true },
      // Pictures', movies' and sounds' bytes, at addresses of their own.
      '/media': 'http://localhost:4000',
      '/avatars': 'http://localhost:4000',
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
  // A plugin package is imported where Vite awaits it, never at the top, so
  // the file stays a synchronous plain object for Nx's project graph.
  plugins: [
    /*
     * JSX with Fast Refresh in development, and the React Compiler, which
     * memoizes components and hooks so a change re-renders only what reads
     * it; vendored Sacred keeps upstream's code as it is. Before it, each
     * gql() becomes an import of its own document, so no map of every
     * operation's text is shipped. (The documents stay in one module, which
     * the first load carries whole: Rollup splits modules, not exports. So
     * alike, they gzip to almost nothing beside the rest; split by importer,
     * the lazy chunks would pay more than the first load saves.)
     */
    Promise.all([
      import('@vitejs/plugin-react'),
      import('@graphql-codegen/client-preset'),
    ]).then(([{ default: react }, { babelOptimizerPlugin }]) =>
      react({
        babel: {
          plugins: [
            [
              babelOptimizerPlugin,
              {
                artifactDirectory: `${__dirname}/src/lib/__generated__`,
                gqlTagName: 'gql',
              },
            ],
            [
              'babel-plugin-react-compiler',
              { sources: (file: string) => !file.includes('/src/sacred/') },
            ],
          ],
        },
      })
    ),
    {
      /*
       * The app's shell: writes this build's version and every file it made
       * into dist/sw.js, which keeps them on the device (public/sw.js), then
       * compresses each text file ahead of time, as .br and .gz beside it, for
       * the server to send as they are.
       */
      name: 'msgr-shell',
      apply: 'build',
      async closeBundle() {
        const { readdir, readFile, writeFile } = await import(
          'node:fs/promises'
        );
        const { createHash } = await import('node:crypto');
        const { brotliCompressSync, gzipSync, constants } = await import(
          'node:zlib'
        );
        const { relative } = await import('node:path');
        const dist = `${__dirname}/dist`;
        const files = (
          await readdir(dist, { recursive: true, withFileTypes: true })
        )
          .filter((entry) => entry.isFile())
          .map((entry) =>
            relative(dist, `${entry.parentPath}/${entry.name}`).replaceAll(
              '\\',
              '/'
            )
          )
          .filter((file) => !/(^sw\.js|\.map|\.br|\.gz)$/.test(file))
          .sort();

        const hash = createHash('sha256');
        for (const file of files) {
          hash.update(file).update(await readFile(`${dist}/${file}`));
        }
        const version = hash.digest('hex').slice(0, 12);
        const shell = files.map((file) => `/${file}`);

        const sw = await readFile(`${dist}/sw.js`, 'utf8');
        const built = sw
          .replace(
            "const VERSION = 'development';",
            `const VERSION = '${version}';`
          )
          .replace(
            'const SHELL = [];',
            `const SHELL = ${JSON.stringify(shell)};`
          );
        if (!built.includes(version) || built.includes('SHELL = [];')) {
          throw new Error('public/sw.js no longer declares VERSION and SHELL');
        }
        await writeFile(`${dist}/sw.js`, built);

        for (const file of [...files, 'sw.js']) {
          if (!/\.(js|css|html|svg|json|webmanifest|ico|txt)$/.test(file))
            continue;
          const bytes = await readFile(`${dist}/${file}`);
          if (bytes.length < 1024) continue; // Too small to gain from it.
          await writeFile(
            `${dist}/${file}.br`,
            brotliCompressSync(bytes, {
              params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
            })
          );
          await writeFile(`${dist}/${file}.gz`, gzipSync(bytes, { level: 9 }));
        }
      },
    },
  ],
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
