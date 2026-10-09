import { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'apps/api/src/graphql/schema.ts',
  documents: [
    'apps/frontend/src/**/*.{ts,tsx}',
    '!apps/frontend/src/lib/__generated__/**',
  ],
  generates: {
    'apps/frontend/src/lib/__generated__/': {
      preset: 'client',
      presetConfig: {
        gqlTagName: 'gql',
      },
    },
  },
  ignoreNoDocuments: true,
};

export default config;
