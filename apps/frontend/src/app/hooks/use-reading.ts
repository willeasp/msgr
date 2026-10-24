import { useEffect, useRef } from 'react';
import { useApolloClient, useMutation } from '@apollo/client/react';
import { gql } from '../../lib/__generated__';
import { recordRead } from '../data/chats';
import { usePageVisible } from './use-page-visible';

const MARK_READ = gql(`
  mutation MarkRead($messageId: ID!) {
    markRead(messageId: $messageId)
  }
`);

/**
 * Tells the server the viewer has read a chat up to its newest message,
 * whenever that's on a visible page: on opening it, as each message
 * arrives, and on coming back to it. Get Info shows the senders, and the
 * chat list stops counting it unread at once.
 */
export function useReading(
  chatId: string,
  newestMessageId: string | undefined
) {
  const visible = usePageVisible();
  const client = useApolloClient();
  const [markRead] = useMutation(MARK_READ);
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (!visible || !newestMessageId || marked.current === newestMessageId) {
      return;
    }
    marked.current = newestMessageId;
    recordRead(client.cache, chatId);
    markRead({ variables: { messageId: newestMessageId } }).catch(() => {
      // Tried again with the next message, or on coming back.
      marked.current = null;
    });
  }, [visible, chatId, newestMessageId, client, markRead]);
}
