import { PubSub, type PubSubEngine } from 'graphql-subscriptions';
import type { ChatEvents } from '../application/ports.js';
import type { ChatAdded } from '../domain/chat.js';
import type { UserId } from '../domain/user.js';

/**
 * Delivers each chat addition on its recipient's personal topic, like
 * `createPubSubMessageEvents`, and on the same terms: in-process by default,
 * or a shared engine to scale out.
 */
export function createPubSubChatEvents(
  pubsub: PubSubEngine = new PubSub()
): ChatEvents {
  const topic = (recipient: UserId) => `chat-added:${recipient}`;
  return {
    publish: (event, recipient) => pubsub.publish(topic(recipient), event),
    subscribe: (recipient) =>
      pubsub.asyncIterableIterator<ChatAdded>(topic(recipient)),
  };
}
