import { useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { useMutation } from '@apollo/client/react';
import { gql } from '../../lib/__generated__';
import {
  nextExpiry,
  shouldSayTyping,
  stillTyping,
  typingIn,
  withoutTypist,
  withTypist,
  type Typist,
  type TypingEvent,
} from '../../lib/typing';

const TYPING = gql(`
  mutation Typing($chatId: ID!) {
    typing(chatId: $chatId)
  }
`);

/**
 * Who is writing to which chat, held outside React state so that a notice
 * re-renders only the title bar that shows it (`useTypingIn`), never the
 * whole desktop.
 */
export interface Typists {
  started(event: TypingEvent): void;
  stopped(chatId: string, userId: string): void;
  subscribe(changed: () => void): () => void;
  current(): readonly Typist[];
}

function createTypists(): Typists {
  let typists: readonly Typist[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  const listeners = new Set<() => void>();
  const set = (next: readonly Typist[]) => {
    if (next.length === 0 && typists.length === 0) return;
    typists = next;
    clearTimeout(timer);
    const expiry = nextExpiry(typists);
    if (expiry !== null) {
      timer = setTimeout(
        () => set(stillTyping(typists, Date.now())),
        Math.max(0, expiry - Date.now())
      );
    }
    for (const changed of listeners) changed();
  };
  return {
    started: (event) => set(withTypist(typists, event, Date.now())),
    stopped: (chatId, userId) => {
      const next = withoutTypist(typists, chatId, userId);
      if (next.length !== typists.length) set(next);
    },
    subscribe(changed) {
      listeners.add(changed);
      return () => listeners.delete(changed);
    },
    current: () => typists,
  };
}

/**
 * Who is writing to which chat, as the feed tells it (`useChatFeed`). Each
 * shows for a few seconds after they last said so, on a timer of its own
 * rather than the clock, which only ticks on the minute.
 */
export function useTypists(): Typists {
  const [typists] = useState(createTypists);
  return typists;
}

/** The names writing to a chat, first to start first. */
export function useTypingIn(typists: Typists, chatId: string): string[] {
  const all = useSyncExternalStore(typists.subscribe, typists.current);
  return useMemo(() => typingIn(all, chatId), [all, chatId]);
}

/**
 * Tells a chat's other participants the viewer is writing to it, every few
 * seconds while they are. `sent` starts afresh with the next message.
 */
export function useSayTyping(chatId: string) {
  const [typing] = useMutation(TYPING);
  const lastSaid = useRef<number | null>(null);
  const saying = useRef<Promise<unknown>>(Promise.resolve());
  return {
    say: (text: string) => {
      const now = Date.now();
      if (!shouldSayTyping(text, lastSaid.current, now)) return;
      lastSaid.current = now;
      // A notice that doesn't get through only goes unseen.
      saying.current = typing({ variables: { chatId } }).catch(() => undefined);
    },
    /**
     * Once the last notice is through. Send after it: a notice the server
     * handled after the message would show them typing again for seconds.
     */
    said: () => saying.current,
    sent: () => {
      lastSaid.current = null;
    },
  };
}
