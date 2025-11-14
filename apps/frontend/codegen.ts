import { CodegenConfig } from '@graphql-codegen/cli';

const config: CodegenConfig = {
  schema: 'apps/api/src/lib/schemas/schema.ts',
  documents: ['apps/frontend/src/**/*.tsx'],
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
