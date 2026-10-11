import { PubSub, type PubSubEngine } from 'graphql-subscriptions';
import type { ProfileEvents } from '../application/ports.js';
import type { User, UserId } from '../domain/user.js';

/**
 * Delivers each changed profile on its recipients' personal topics, like
 * `createPubSubMessageEvents`, and on the same terms: in-process by default,
 * or a shared engine to scale out.
 */
export function createPubSubProfileEvents(
  pubsub: PubSubEngine = new PubSub()
): ProfileEvents {
  const topic = (recipient: UserId) => `profile-changed:${recipient}`;
  return {
    async publish(user, recipients) {
      await Promise.all(
        recipients.map((recipient) => pubsub.publish(topic(recipient), user))
      );
    },
    subscribe: (recipient) =>
      pubsub.asyncIterableIterator<User>(topic(recipient)),
  };
}
