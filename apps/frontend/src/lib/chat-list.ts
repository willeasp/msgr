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
 * A message older than the chat's preview, arriving late, changes nothing.
 */
export function withReceivedMessage(
  chats: readonly ChatRow[],
  { chat, id, content, movie, sound, createdAt }: ReceivedMessage
): readonly ChatRow[] {
  const preview = chats.find((row) => row.id === chat.id)?.messages[0];
  if (preview && Date.parse(preview.createdAt) > Date.parse(createdAt))
    return chats;
  return [
    {
      ...chat,
      messages: [
        {
          id,
          content,
          movie: movie && { frames: movie.frames },
          sound: sound && { frames: sound.frames },
          createdAt,
        },
      ],
    },
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

/** The chat list with a chat that has just come to include the viewer, on top. */
export function withChat(
  chats: readonly ChatRow[],
  chat: ChatRow
): readonly ChatRow[] {
  return chats.some(({ id }) => id === chat.id) ? chats : [chat, ...chats];
}
