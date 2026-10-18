import type { CodegenConfig } from '@graphql-codegen/cli';

// Paths are relative to the workspace root, where Nx runs codegen.
const config: CodegenConfig = {
  schema: 'apps/api/src/graphql/schema.ts',
  generates: {
    'apps/api/src/graphql/__generated__/resolvers.ts': {
      plugins: ['typescript', 'typescript-resolvers'],
      config: {
        contextType: '../context.js#Context',
        // Resolvers take and return domain entities; field resolvers walk relations.
        mappers: {
          AuthPayload: '../../domain/user.js#Session',
          ChannelListing: '../../domain/chat.js#ChannelChat',
          Chat: '../../domain/chat.js#Chat',
          ChatAdded: '../../domain/chat.js#ChatAdded',
          Invite: '../../domain/invite.js#Invite',
          LinkPreview: '../../domain/link-preview.js#LinkPreview',
          Message: '../../domain/message.js#Message',
          Movie: '../../domain/movie.js#Movie',
          Picture: '../../domain/picture.js#Picture',
          SignUpPayload: '../../application/auth.service.js#Welcome',
          User: '../../domain/user.js#User',
        },
        mapperTypeSuffix: 'Model',
        scalars: { DateTime: 'Date' },
        strictScalars: true,
        useTypeImports: true,
      },
    },
  },
};

export default config;
