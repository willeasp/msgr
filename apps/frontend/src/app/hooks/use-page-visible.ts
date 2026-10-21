import { useSyncExternalStore } from 'react';

const onVisibilityChange = (changed: () => void) => {
  document.addEventListener('visibilitychange', changed);
  return () => document.removeEventListener('visibilitychange', changed);
};
const isVisible = () => document.visibilityState === 'visible';

/** Whether the page is on screen: false while hidden, a locked phone included. */
export const usePageVisible = () =>
  useSyncExternalStore(onVisibilityChange, isVisible);
