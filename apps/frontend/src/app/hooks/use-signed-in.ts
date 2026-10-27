import { createContext, useContext, useEffect } from 'react';
import type { GetMeQuery } from '../../lib/__generated__/graphql';
import type { Typists } from './use-typing';

export type Viewer = NonNullable<GetMeQuery['me']>;

/** A Special menu item the signed-in state offers, such as Notifications. */
export interface SpecialItem {
  readonly label: string;
  readonly checked?: boolean;
  onClick(): void;
}

/** What every signed-in view shares, kept by `SignedIn` whatever's on screen. */
export interface SignedInValue {
  readonly viewer: Viewer;
  readonly isAdmin: boolean;
  /** Whether Attach offers GIF…: the server can search GIPHY. */
  readonly gifsOn: boolean;
  readonly typists: Typists;
  readonly alertSound: { readonly on: boolean; toggle(): void };
  /** Special → Notifications, where this browser can have them. */
  readonly notifications?: SpecialItem;
  /** Present while the browser offers to install Msgr. */
  readonly install?: () => Promise<void>;
  /** Which chat a window shows; only `useChatOnScreen` sets it. */
  readonly showChat: React.Dispatch<React.SetStateAction<string | null>>;
  /** Whether a chat's history is scrolled up from its newest; only `useAwayFromNewest` says. */
  readonly awayFromNewest: (chatId: string, away: boolean) => void;
}

/** Provided by `SignedIn` (components/SignedIn.tsx) alone. */
export const SignedInContext = createContext<SignedInValue | null>(null);

/** What every signed-in view shares. Only views under `SignedIn` may ask. */
export function useSignedIn(): SignedInValue {
  const value = useContext(SignedInContext);
  if (!value) throw new Error('useSignedIn is only for routes under SignedIn');
  return value;
}

/**
 * Says this chat is on screen while the calling component is mounted, so its
 * messages neither beep nor notify. The chat window calls it, so a view that
 * shows no chat watches none.
 */
export function useChatOnScreen(chatId: string) {
  const { showChat } = useSignedIn();
  useEffect(() => {
    showChat(chatId);
    return () => showChat((shown) => (shown === chatId ? null : shown));
  }, [chatId, showChat]);
}

/**
 * Says this chat's history is scrolled up from its newest message while
 * `away`, so what arrives meanwhile waits below, unread, counted in the chat
 * list as if the chat weren't open. Its history calls it.
 */
export function useAwayFromNewest(chatId: string, away: boolean) {
  const { awayFromNewest } = useSignedIn();
  useEffect(() => {
    if (!away) return;
    awayFromNewest(chatId, true);
    return () => awayFromNewest(chatId, false);
  }, [chatId, away, awayFromNewest]);
}
