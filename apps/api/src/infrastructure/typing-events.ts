import { PubSub, type PubSubEngine } from 'graphql-subscriptions';
import type { TypingEvents } from '../application/ports.js';
import type { Typing } from '../domain/typing.js';
import type { UserId } from '../domain/user.js';

/**
 * Delivers each "is typing" on its recipients' personal topics, like
 * `createPubSubMessageEvents`, and on the same terms: in-process by default,
 * or a shared engine to scale out. Nothing is stored.
 */
export function createPubSubTypingEvents(
  pubsub: PubSubEngine = new PubSub()
): TypingEvents {
  const topic = (recipient: UserId) => `typing:${recipient}`;
  return {
    async publish(event, recipients) {
      await Promise.all(
        recipients.map((recipient) => pubsub.publish(topic(recipient), event))
      );
    },
    subscribe: (recipient) =>
      pubsub.asyncIterableIterator<Typing>(topic(recipient)),
  };
}
