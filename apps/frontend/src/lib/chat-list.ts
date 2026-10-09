import type {
  GetChatsQuery,
  OnMessageReceivedForSidebarSubscription,
} from './__generated__/graphql';

export type ChatRow = GetChatsQuery['chats'][number];
export type ReceivedMessage =
  OnMessageReceivedForSidebarSubscription['messageReceived'];

/**
 * The chat list after a message arrives: its chat moves to the top with the
 * message as its preview, joining the list if this is the chat's first message
 * the viewer has seen. This matches the server's most-recently-active order.
 */
export function withReceivedMessage(
  chats: readonly ChatRow[],
  { chat, ...message }: ReceivedMessage
): ChatRow[] {
  return [
    { ...chat, messages: [message] },
    ...chats.filter(({ id }) => id !== chat.id),
  ];
}
