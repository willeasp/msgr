import baseConfig from '../../eslint.config.mjs';

/** The dependency rule: a layer may only import the layers inside it. */
const layer = (name, outer) => ({
  files: [`src/${name}/**/*.ts`],
  ignores: ['**/*.test.ts'],
  rules: {
    'no-restricted-imports': [
      'error',
      {
        patterns: outer.map((dir) => ({
          regex: `(^|/)${dir}/`,
          message: `${name}/ must not depend on ${dir}/.`,
        })),
      },
    ],
  },
});

export default [
  ...baseConfig,
  layer('domain', ['application', 'infrastructure', 'graphql', 'testing']),
  layer('application', ['infrastructure', 'graphql', 'testing']),
  layer('infrastructure', ['graphql', 'testing']),
  // Only main.ts picks adapters: the transport knows ports, never their makers.
  layer('graphql', ['infrastructure', 'testing']),
];
