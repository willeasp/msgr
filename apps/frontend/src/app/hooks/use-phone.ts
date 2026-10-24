import { useMediaQuery } from './use-media-query';

/** Narrower than this, the screen is a phone's: one window at a time, edge to edge. */
export const PHONE = '(max-width: 760px)';

/** Whether the screen is laid out as a phone's (ADR 0013). */
export const usePhone = () => useMediaQuery(PHONE);
