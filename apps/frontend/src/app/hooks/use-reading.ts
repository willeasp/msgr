import { useEffect, useRef } from 'react';
import { useApolloClient } from '@apollo/client/react';
import { gql } from '../../lib/__generated__';
import { GET_CHATS, recordRead } from '../data/chats';
import { useOnline } from './use-online';
import { usePageVisible } from './use-page-visible';

const MARK_READ = gql(`
  mutation MarkRead($messageId: ID!) {
    markRead(messageId: $messageId)
  }
`);

/**
 * Tells the server the viewer has read a chat up to `readTo` whenever it's
 * on a visible page: its newest message while the history is `atNewest` (on
 * opening it, as each message arrives, on coming back to it), else the
 * newest they saw before scrolling up; and once the network is back after a
 * try that failed. Get Info shows the senders. At its newest, the chat list
 * counts none of it unread: cleared at once, and again whenever a list the
 * server counted before this read lands after it (a watch on the cache, not
 * a query, so it fetches nothing).
 */
export function useReading(
  chatId: string,
  readTo: string | undefined,
  atNewest: boolean
) {
  const visible = usePageVisible();
  const online = useOnline();
  const client = useApolloClient();
  const marked = useRef<string | null>(null);

  useEffect(() => {
    if (!visible || !atNewest) return;
    return client.cache.watch({
      query: GET_CHATS,
      optimistic: true,
      immediate: true,
      callback: ({ result, complete }) => {
        if (!complete) return;
        const counted = result.chats.some(
          (chat) => chat.id === chatId && chat.unreadCount > 0
        );
        // After this broadcast, not in it.
        if (counted) queueMicrotask(() => recordRead(client.cache, chatId));
      },
    });
  }, [visible, atNewest, chatId, client]);

  useEffect(() => {
    if (!visible || !online || !readTo) return;
    if (marked.current === readTo) return;
    marked.current = readTo;
    // By the client, not useMutation, whose loading would render the
    // history twice for each read.
    client
      .mutate({ mutation: MARK_READ, variables: { messageId: readTo } })
      .catch(() => {
        // Tried again with the next message, on coming back, or once online.
        marked.current = null;
      });
  }, [visible, online, readTo, client]);
}
