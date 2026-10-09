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
  { chat, id, content, createdAt }: ReceivedMessage
): ChatRow[] {
  return [
    { ...chat, messages: [{ id, content, createdAt }] },
    ...chats.filter((row) => row.id !== chat.id),
  ];
}

/** A chat's history with `message` at the end, unless it already has it. */
export function withMessage<M extends { readonly id: string }>(
  history: readonly M[],
  message: M
): readonly M[] {
  return history.some(({ id }) => id === message.id)
    ? history
    : [...history, message];
}
