import { useSyncExternalStore } from 'react';
import { useSubscription } from '@apollo/client/react';
import { gql } from '../../lib/__generated__';

const WATCHING = gql(`
  subscription Watching($chatId: ID!) {
    watching(chatId: $chatId)
  }
`);

const onVisibilityChange = (changed: () => void) => {
  document.addEventListener('visibilitychange', changed);
  return () => document.removeEventListener('visibilitychange', changed);
};
const isVisible = () => document.visibilityState === 'visible';

/**
 * Tells the server which chat this page shows while it's visible, so that
 * chat's messages don't notify the viewer. Hiding the page, locking the phone
 * included, stops it at once.
 */
export function useWatching(chatId: string | undefined) {
  const visible = useSyncExternalStore(onVisibilityChange, isVisible);
  useSubscription(WATCHING, {
    variables: { chatId: chatId ?? '' },
    skip: !chatId || !visible,
  });
}
