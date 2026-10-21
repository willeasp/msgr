import { useCallback, useEffect, useRef, useState } from 'react';
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
 * Who is writing to which chat, as the feed tells it (`useChatFeed`). Each
 * shows for a few seconds after they last said so, on a timer of its own
 * rather than the clock, which only ticks on the minute.
 */
export function useTypists() {
  const [typists, setTypists] = useState<readonly Typist[]>([]);

  useEffect(() => {
    const next = nextExpiry(typists);
    if (next === null) return;
    const timer = setTimeout(
      () => setTypists((now) => stillTyping(now, Date.now())),
      Math.max(0, next - Date.now())
    );
    return () => clearTimeout(timer);
  }, [typists]);

  const started = useCallback(
    (event: TypingEvent) =>
      setTypists((now) => withTypist(now, event, Date.now())),
    []
  );
  const stopped = useCallback(
    (chatId: string, userId: string) =>
      setTypists((now) => withoutTypist(now, chatId, userId)),
    []
  );
  const writingTo = useCallback(
    (chatId: string) => typingIn(typists, chatId),
    [typists]
  );
  return { started, stopped, writingTo };
}

/**
 * Tells a chat's other participants the viewer is writing to it, every few
 * seconds while they are. `sent` starts afresh with the next message.
 */
export function useSayTyping(chatId: string) {
  const [typing] = useMutation(TYPING);
  const lastSaid = useRef<number | null>(null);
  return {
    say: (text: string) => {
      const now = Date.now();
      if (!shouldSayTyping(text, lastSaid.current, now)) return;
      lastSaid.current = now;
      // A notice that doesn't get through only goes unseen.
      typing({ variables: { chatId } }).catch(() => undefined);
    },
    sent: () => {
      lastSaid.current = null;
    },
  };
}
