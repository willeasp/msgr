import { PubSub } from 'graphql-subscriptions';

export const pubsub = new PubSub();

export const MESSAGE_RECEIVED = 'MESSAGE_RECEIVED';

/**
 * Helper to create async iterator from PubSub
 * This provides a custom implementation for handling subscription events
 */
export function createAsyncIterator<T>(
  pubsub: PubSub,
  triggers: string | string[]
) {
  const triggerArray = Array.isArray(triggers) ? triggers : [triggers];

  return {
    async *[Symbol.asyncIterator]() {
      const queue: any[] = [];
      const subscriptionIds: number[] = [];
      let listening = true;
      let resolve: ((value: T) => void) | null = null;

      // Subscribe to all triggers
      for (const trigger of triggerArray) {
        const id = await pubsub.subscribe(trigger, (payload: T) => {
          if (resolve) {
            resolve(payload);
            resolve = null;
          } else {
            queue.push(payload);
          }
        });
        subscriptionIds.push(id);
      }

      try {
        while (listening) {
          if (queue.length > 0) {
            yield queue.shift();
          } else {
            yield await new Promise<T>((r) => {
              resolve = r;
            });
          }
        }
      } finally {
        listening = false;
        subscriptionIds.forEach((id) => pubsub.unsubscribe(id));
      }
    },
  };
}
