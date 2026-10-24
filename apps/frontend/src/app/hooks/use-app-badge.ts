import { useEffect } from 'react';
import { useApolloClient } from '@apollo/client/react';
import { showBadge } from '../browser/badge';
import { GET_CHATS } from '../data/chats';

/**
 * Keeps the app's badge at the viewer's unread messages, every chat's
 * together, as the cached chat list counts them: up as they arrive, down as
 * they're read. A watch on the cache, not a query: it asks the server for
 * nothing, renders nothing, and leaves the chat list to whoever shows it, so
 * catching up still fetches the list when nothing does (`catchUp`).
 */
export function useAppBadge() {
  const client = useApolloClient();
  useEffect(() => {
    let shown: number | null = null;
    return client.cache.watch({
      query: GET_CHATS,
      optimistic: true,
      immediate: true,
      callback: ({ result, complete }) => {
        if (!complete || !result) return;
        const total = result.chats.reduce(
          (sum, chat) => sum + chat.unreadCount,
          0
        );
        if (total === shown) return;
        shown = total;
        showBadge(total);
      },
    });
  }, [client]);
}
