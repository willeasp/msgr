// What a first visit downloads, and everything else the build made, measured
// as the server sends it: raw, gzip and brotli (vite.config.ts writes both).
// `node apps/frontend/scripts/bundle.mjs` after a build prints the report;
// `--json` prints it as JSON; `--check` fails when the first load's
// JavaScript, gzipped, is over BUDGET.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';

/**
 * The first load's JavaScript, gzipped, in kB: measured at 165.4, of which
 * React, Apollo and the router are 118 (162.7 before a history kept its
 * place, named its days and fetched earlier pages, ADR 0015; 159.7 before a
 * phone's title bar, Get Info's long press and the keyboard-following
 * screen, ADR 0013). A screen or dialog imported where it isn't needed at
 * once (rather than through app/components/dialogs.tsx or a lazy route) is a
 * kilobyte or more, and fails here.
 */
const BUDGET_KB = 166;

const dist = new URL('../dist/', import.meta.url).pathname;
const html = readFileSync(join(dist, 'index.html'), 'utf8');
const first = new Set(
  [
    ...html.matchAll(/<script[^>]+src="\/([^"]+)"/g),
    ...html.matchAll(
      /<link[^>]+rel="(?:modulepreload|stylesheet)"[^>]+href="\/([^"]+)"/g
    ),
    ...html.matchAll(
      /<link[^>]+href="\/([^"]+)"[^>]+rel="(?:modulepreload|stylesheet)"/g
    ),
  ].map((match) => match[1])
);

const sizeOf = (file) => {
  const bytes = readFileSync(join(dist, file));
  return {
    file,
    raw: bytes.length,
    gzip: gzipSync(bytes, { level: 9 }).length,
    brotli: brotliCompressSync(bytes, {
      params: { [constants.BROTLI_PARAM_QUALITY]: 11 },
    }).length,
  };
};
const walk = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [relative(dist, path)];
  });
const built = walk(dist).filter(
  (file) => /\.(js|css)$/.test(file) && !file.startsWith('sw')
);
const sum = (files, key) => files.reduce((total, file) => total + file[key], 0);
const kB = (bytes) => Math.round(bytes / 102.4) / 10;

const firstLoad = built.filter((file) => first.has(file)).map(sizeOf);
const later = built.filter((file) => !first.has(file)).map(sizeOf);
const js = firstLoad.filter(({ file }) => file.endsWith('.js'));
const report = {
  firstLoad: {
    js: {
      files: js.length,
      raw: kB(sum(js, 'raw')),
      gzip: kB(sum(js, 'gzip')),
      brotli: kB(sum(js, 'brotli')),
    },
    css: (() => {
      const css = firstLoad.filter(({ file }) => file.endsWith('.css'));
      return {
        raw: kB(sum(css, 'raw')),
        gzip: kB(sum(css, 'gzip')),
        brotli: kB(sum(css, 'brotli')),
      };
    })(),
    files: firstLoad.map(({ file, raw, gzip, brotli }) => ({
      file,
      raw: kB(raw),
      gzip: kB(gzip),
      brotli: kB(brotli),
    })),
  },
  later: {
    js: {
      files: later.length,
      raw: kB(sum(later, 'raw')),
      gzip: kB(sum(later, 'gzip')),
    },
    files: later
      .sort((a, b) => b.gzip - a.gzip)
      .map(({ file, raw, gzip }) => ({ file, raw: kB(raw), gzip: kB(gzip) })),
  },
};

if (process.argv.includes('--json')) {
  console.log(JSON.stringify(report, null, 2));
} else {
  const { js: j, css } = report.firstLoad;
  console.log(
    `First load: ${j.files} scripts, ${j.raw} kB (${j.gzip} kB gzip, ${j.brotli} kB brotli); CSS ${css.raw} kB (${css.gzip} kB gzip)`
  );
  for (const f of report.firstLoad.files)
    console.log(`  ${f.file}  ${f.raw} kB, ${f.gzip} kB gzip`);
  console.log(
    `Later, on demand: ${report.later.js.files} files, ${report.later.js.raw} kB (${report.later.js.gzip} kB gzip)`
  );
  for (const f of report.later.files)
    console.log(`  ${f.file}  ${f.raw} kB, ${f.gzip} kB gzip`);
}
if (process.argv.includes('--check') && report.firstLoad.js.gzip > BUDGET_KB) {
  console.error(
    `The first load's JavaScript is ${report.firstLoad.js.gzip} kB gzipped, over its budget of ${BUDGET_KB} kB.`
  );
  process.exit(1);
}
