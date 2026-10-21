import { useSubscription } from '@apollo/client/react';
import { gql } from '../../lib/__generated__';
import { usePageVisible } from './use-page-visible';

const WATCHING = gql(`
  subscription Watching($chatId: ID!) {
    watching(chatId: $chatId)
  }
`);

/**
 * Tells the server which chat this page shows while it's visible, so that
 * chat's messages don't notify the viewer. Hiding the page, locking the phone
 * included, stops it at once.
 */
export function useWatching(chatId: string | undefined) {
  const visible = usePageVisible();
  useSubscription(WATCHING, {
    variables: { chatId: chatId ?? '' },
    skip: !chatId || !visible,
  });
}
