import type { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  // Use workspace-root relative paths so the codegen CLI (run from the repo root)
  // can resolve the schema and output locations correctly.
  schema: 'apps/api/src/lib/schemas/schema.ts',
  generates: {
    'apps/api/src/lib/__generated__/models.ts': {
      plugins: ['typescript'],
      config: {
        avoidOptionals: true,
      },
    },
    'apps/api/src/lib/__generated__/resolvers.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        useIndexSignature: true,
      },
    },
  },
};

export default config;
