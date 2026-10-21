import { useEffect, useRef } from 'react';
import { useMutation } from '@apollo/client/react';
import { gql } from '../../lib/__generated__';
import { usePageVisible } from './use-page-visible';

const MARK_READ = gql(`
  mutation MarkRead($messageId: ID!) {
    markRead(messageId: $messageId)
  }
`);

/**
 * Tells the server the viewer has read a chat up to its newest message,
 * whenever that's on a visible page: on opening it, as each message
 * arrives, and on coming back to it. Get Info shows the senders.
 */
export function useReading(newestMessageId: string | undefined) {
  const visible = usePageVisible();
  const [markRead] = useMutation(MARK_READ);
  const marked = useRef<string | null>(null);
  useEffect(() => {
    if (!visible || !newestMessageId || marked.current === newestMessageId) {
      return;
    }
    marked.current = newestMessageId;
    markRead({ variables: { messageId: newestMessageId } }).catch(() => {
      // Tried again with the next message, or on coming back.
      marked.current = null;
    });
  }, [visible, newestMessageId, markRead]);
}
