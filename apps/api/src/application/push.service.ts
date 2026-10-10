import { ChatId } from '../domain/chat.js';
import type { InvalidInput } from '../domain/errors.js';
import { PushSubscription } from '../domain/push.js';
import { ok, type Result } from '../domain/result.js';
import type { User } from '../domain/user.js';
import type { Dependencies } from './ports.js';

export type PushService = ReturnType<typeof createPushService>;

export function createPushService({
  repositories,
  pushKey,
  watching,
}: Dependencies) {
  return {
    /** The VAPID key browsers subscribe with; null while push is off. */
    key: (): string | null => pushKey,

    /** Notifies this browser of the viewer's chats from now on, and nobody else's. */
    async enable(
      viewer: User,
      input: {
        readonly endpoint: string;
        readonly p256dh: string;
        readonly auth: string;
      }
    ): Promise<Result<true, InvalidInput>> {
      const subscription = PushSubscription.parse(input);
      if (!subscription.ok) return subscription;
      await repositories.pushSubscriptions.save(viewer.id, subscription.value);
      return ok(true);
    },

    /** Stops notifying this browser, if it was the viewer's. */
    async disable(viewer: User, endpoint: string): Promise<true> {
      await repositories.pushSubscriptions.remove(endpoint, viewer.id);
      return true;
    },

    /**
     * Counts the viewer as watching a chat from the first `next()` until
     * `return()`, which graphql-ws calls when the page lets go or its socket
     * drops. Never yields.
     */
    watch(viewer: User, chatId: string): AsyncIterableIterator<never> {
      let release: (() => void) | undefined;
      let ended = false;
      let end = () => undefined as void;
      const finished = new Promise<void>((resolve) => (end = resolve));
      const done = { done: true, value: undefined } as const;
      return {
        [Symbol.asyncIterator]() {
          return this;
        },
        async next() {
          if (!ended) release ??= watching.watch(viewer.id, ChatId(chatId));
          await finished;
          return done;
        },
        async return() {
          ended = true;
          release?.();
          end();
          return done;
        },
      };
    },
  };
}
