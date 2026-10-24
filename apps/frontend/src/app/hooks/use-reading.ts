import { useEffect, useRef } from 'react';
import { useApolloClient, useMutation } from '@apollo/client/react';
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
 * Tells the server the viewer has read a chat up to its newest message,
 * whenever that's on a visible page: on opening it, as each message
 * arrives, on coming back to it, and once the network is back after a try
 * that failed. Get Info shows the senders. And the chat list counts none of
 * it unread while it's read: cleared at once, and again whenever a list the
 * server counted before this read lands after it (a watch on the cache, not
 * a query, so it fetches nothing).
 */
export function useReading(
  chatId: string,
  newestMessageId: string | undefined
) {
  const visible = usePageVisible();
  const online = useOnline();
  const client = useApolloClient();
  const [markRead] = useMutation(MARK_READ);
  const marked = useRef<string | null>(null);

  useEffect(() => {
    if (!visible) return;
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
  }, [visible, chatId, client]);

  useEffect(() => {
    if (!visible || !online || !newestMessageId) return;
    if (marked.current === newestMessageId) return;
    marked.current = newestMessageId;
    markRead({ variables: { messageId: newestMessageId } }).catch(() => {
      // Tried again with the next message, on coming back, or once online.
      marked.current = null;
    });
  }, [visible, online, newestMessageId, markRead]);
}
