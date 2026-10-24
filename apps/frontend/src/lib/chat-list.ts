import type {
  GetChatsQuery,
  OnMessageReceivedForSidebarSubscription,
} from './__generated__/graphql';

export type ChatRow = GetChatsQuery['chats'][number];
export type ReceivedMessage =
  OnMessageReceivedForSidebarSubscription['messageReceived'];

/** Whoever the message reaches: the viewer, and whether they're reading its chat now. */
export interface Receiver {
  readonly viewerId: string;
  /** On their screen, on a page they can see. */
  readonly reading: boolean;
}

/**
 * The chat list after a message arrives: its chat moves to the top with the
 * message as its preview, joining the list if this is the chat's first message
 * the viewer has seen. This matches the server's most-recently-active order.
 * A message older than the chat's preview, arriving late, leaves the preview
 * be, and one already there changes nothing. It's unread, as the server
 * counts it (`Chat.unreadCount`), unless the viewer is reading the chat or
 * sent it, which reads everything before it; arriving late, only if what
 * came after it is unread.
 */
export function withReceivedMessage(
  chats: readonly ChatRow[],
  { chat, id, content, movie, sound, createdAt, sender }: ReceivedMessage,
  { viewerId, reading }: Receiver
): readonly ChatRow[] {
  const known = chats.find((row) => row.id === chat.id);
  const preview = known?.messages[0];
  if (preview?.id === id) return chats;
  const read = reading || sender.id === viewerId;
  if (preview && Date.parse(preview.createdAt) > Date.parse(createdAt)) {
    // Late: the preview stays. Unread too if what came after it is.
    return !read && known.unreadCount > 0
      ? chats.map((row) =>
          row === known ? { ...row, unreadCount: row.unreadCount + 1 } : row
        )
      : chats;
  }
  return [
    {
      ...chat,
      unreadCount: read ? 0 : (known?.unreadCount ?? 0) + 1,
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

/** A chat's unread count as the list shows it: a small number stays small. */
export const unreadLabel = (count: number): string =>
  count > 99 ? '99+' : String(count);
