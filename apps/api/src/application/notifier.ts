import type { Chat, ChatAdded } from '../domain/chat.js';
import type { Message } from '../domain/message.js';
import {
  chatAddedNotification,
  messageNotification,
  type Notification,
} from '../domain/push.js';
import type { User, UserId } from '../domain/user.js';
import type { Dependencies } from './ports.js';

export type Notifier = ReturnType<typeof createNotifier>;

/**
 * Pushes what happened to the browsers of everyone it concerns, except anyone
 * watching that chat: their open window already shows it.
 */
export function createNotifier({
  repositories,
  pushSender,
  watching,
}: Dependencies) {
  async function push(userIds: readonly UserId[], notification: Notification) {
    const recipients = userIds.filter(
      (id) => !watching.isWatching(id, notification.chatId)
    );
    if (recipients.length === 0) return;
    const browsers = await repositories.pushSubscriptions.findByUserIds(
      recipients
    );
    if (browsers.length === 0) return;
    // Counted after the message is kept, so it's in the badge too.
    const unread = new Map(
      (
        await repositories.reads.countAllUnread([
          ...new Set(browsers.map(({ userId }) => userId)),
        ])
      ).map(({ readerId, total }) => [readerId, total])
    );
    await Promise.all(
      browsers.map(async ({ userId, subscription }) => {
        try {
          const outcome = await pushSender.send(subscription, {
            notification,
            unread: unread.get(userId) ?? 0,
          });
          if (outcome === 'gone') {
            await repositories.pushSubscriptions.remove(
              subscription.endpoint,
              userId
            );
          }
        } catch (error) {
          console.error('A push failed', error);
        }
      })
    );
  }

  /** In the background of what caused it, which never fails because a push did. */
  const quietly = (work: Promise<void>) =>
    work.catch((error) => console.error('Pushing failed', error));

  return {
    /** A new message, for its chat's participants except the sender. Never rejects. */
    message: (message: Message, chat: Chat, sender: User) =>
      quietly(
        push(
          chat.participantIds.filter((id) => id !== sender.id),
          messageNotification(message, sender, chat)
        )
      ),

    /** A chat now includes `recipient`, because of `by`. Never rejects. */
    chatAdded: (event: ChatAdded, by: User, recipient: UserId) =>
      quietly(push([recipient], chatAddedNotification(event, by))),
  };
}
