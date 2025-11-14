import { GetChatsQuery } from './__generated__/graphql';

export type ChatData = GetChatsQuery['chats'][number];
