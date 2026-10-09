import { PubSub, type PubSubEngine } from 'graphql-subscriptions';
import type { MessageEvents } from '../application/ports.js';
import type { Message } from '../domain/message.js';
import type { UserId } from '../domain/user.js';

/**
 * Delivers each message on its recipients' personal topics, so subscribers
 * only ever receive messages from chats they are in. The default in-process
 * PubSub serves a single instance; pass a shared engine (e.g. Redis) to scale out.
 */
export function createPubSubMessageEvents(
  pubsub: PubSubEngine = new PubSub()
): MessageEvents {
  const topic = (recipient: UserId) => `message-received:${recipient}`;
  return {
    async publish(message, recipients) {
      await Promise.all(
        recipients.map((recipient) => pubsub.publish(topic(recipient), message))
      );
    },
    subscribe: (recipient) =>
      pubsub.asyncIterableIterator<Message>(topic(recipient)),
  };
}
