import type { PushSubscriptionRepository } from '../../application/ports.js';
import type { PushSubscription } from '../../domain/push.js';
import { UserId } from '../../domain/user.js';
import type { PrismaClient } from './client.js';

export function prismaPushSubscriptionRepository(
  db: PrismaClient
): PushSubscriptionRepository {
  return {
    async save(userId, { endpoint, p256dh, auth }) {
      await db.pushSubscription.upsert({
        where: { endpoint },
        create: { endpoint, p256dh, auth, userId },
        update: { p256dh, auth, userId },
      });
    },

    async findByUserIds(ids) {
      if (ids.length === 0) return [];
      const rows = await db.pushSubscription.findMany({
        where: { userId: { in: [...ids] } },
      });
      return rows.map(({ userId, endpoint, p256dh, auth }) => ({
        userId: UserId(userId),
        subscription: { endpoint, p256dh, auth } as PushSubscription,
      }));
    },

    async remove(endpoint, userId) {
      await db.pushSubscription.deleteMany({ where: { endpoint, userId } });
    },
  };
}
