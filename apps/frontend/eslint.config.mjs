import nx from '@nx/eslint-plugin';
import baseConfig from '../../eslint.config.mjs';

/*
 * The app's shape (ADR 0010), enforced: each folder may only import the
 * folders below it, the browser's devices and storage are reached only
 * through app/browser/, and lib/ is pure.
 *
 *   pages → components → hooks → data, browser → lib
 */

const TESTS = ['**/*.test.ts', '**/*.test.tsx'];

/** Folder `dir` may not import from any of `outer`, nor these packages. */
const layer = (dir, outer, packages = []) => ({
  files: [`src/${dir}/**/*.{ts,tsx}`],
  ignores: TESTS,
  rules: {
    'no-restricted-imports': [
      'error',
      {
        paths: packages.map((name) => ({
          name,
          message: `${dir}/ is below React: keep it out (ADR 0010).`,
        })),
        patterns: outer.map((folder) => ({
          regex: `(^|/)${folder}/`,
          message: `${dir}/ must not depend on ${folder}/ (ADR 0010).`,
        })),
      },
    ],
  },
});

const REACT = [
  'react',
  'react-dom',
  'react-router-dom',
  '@apollo/client/react',
];

/** The browser's devices, decoders and storage: app/browser/'s alone. */
const BROWSER_ONLY = [
  'localStorage',
  'sessionStorage',
  'indexedDB',
  'AudioContext',
  'OfflineAudioContext',
  'MediaRecorder',
  'createImageBitmap',
].map((name) => ({
  name,
  message: `${name} is the browser's: use or add to app/browser/ (ADR 0010).`,
}));

/** The page itself, which pure code never touches. */
const PAGE = [
  'document',
  'window',
  'navigator',
  'location',
  'history',
  'matchMedia',
  'requestAnimationFrame',
  'fetch',
].map((name) => ({
  name,
  message: `lib/ is pure: take ${name}'s answer as an argument instead (ADR 0010).`,
}));

const browserOnly = {
  'no-restricted-globals': ['error', ...BROWSER_ONLY],
  'no-restricted-properties': [
    'error',
    ...['localStorage', 'sessionStorage', 'indexedDB'].map((property) => ({
      object: 'window',
      property,
      message: `${property} is the browser's: use app/browser/storage.ts (ADR 0010).`,
    })),
    ...['mediaDevices', 'audioSession'].map((property) => ({
      object: 'navigator',
      property,
      message: `navigator.${property} is the browser's: use app/browser/audio.ts (ADR 0010).`,
    })),
  ],
  'no-restricted-syntax': [
    'error',
    {
      selector:
        "CallExpression[callee.object.name='document'][callee.property.name='createElement'][arguments.0.value=/^(canvas|video|audio)$/]",
      message:
        'Drawing or decoding off screen is the browser’s: use or add to app/browser/ (ADR 0010).',
    },
  ],
};

export default [
  ...baseConfig,
  ...nx.configs['flat/react'],
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.js', '**/*.jsx'],
    // Override or add rules here
    rules: {},
  },
  {
    // Vendored Sacred Computer components keep upstream's loose typing so they stay diffable.
    files: ['src/sacred/**/*.ts', 'src/sacred/**/*.tsx'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-non-null-assertion': 'off',
      'react-hooks/exhaustive-deps': 'off',
    },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    ignores: [...TESTS, 'src/app/browser/**', 'src/sacred/**'],
    rules: browserOnly,
  },
  {
    files: ['src/lib/**/*.ts'],
    ignores: [...TESTS, 'src/lib/__generated__/**'],
    rules: {
      ...browserOnly,
      'no-restricted-globals': ['error', ...BROWSER_ONLY, ...PAGE],
    },
  },
  layer('lib', ['app', 'sacred'], REACT),
  layer(
    'app/browser',
    ['components', 'hooks', 'pages', 'data', 'sacred'],
    REACT
  ),
  layer('app/data', ['components', 'hooks', 'pages', 'browser', 'sacred']),
  layer('app/hooks', ['components', 'pages']),
  layer('app/components', ['pages']),
];
