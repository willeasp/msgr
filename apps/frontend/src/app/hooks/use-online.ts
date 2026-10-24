import { useSyncExternalStore } from 'react';

const onConnectionChange = (changed: () => void) => {
  window.addEventListener('online', changed);
  window.addEventListener('offline', changed);
  return () => {
    window.removeEventListener('online', changed);
    window.removeEventListener('offline', changed);
  };
};
const isOnline = () => navigator.onLine;

/** Whether the device thinks it has a network; false is sure, true is hopeful. */
export const useOnline = () =>
  useSyncExternalStore(onConnectionChange, isOnline);
