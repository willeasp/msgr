/*
 * How a chat's history is laid out: each day opens with its name, and a run
 * of messages from one sender, each within five minutes of the last, shows
 * its sender's face and name, and its time, once.
 */

/** How long one sender may pause and still be in the same run. */
export const RUN_GAP_MS = 5 * 60_000;

export interface Placed<M> {
  readonly message: M;
  /** The first of its day: the day's name goes above it. */
  readonly startsDay: boolean;
  /** The first of a run: its sender's face and name, and its time, go with it. */
  readonly startsRun: boolean;
}

/** Each message of a history, oldest first, with where its day and run start. Days are the device's. */
export function placeMessages<
  M extends {
    readonly sender: { readonly id: string };
    readonly createdAt: string;
  }
>(messages: readonly M[]): Placed<M>[] {
  return messages.map((message, index) => {
    const before = messages[index - 1];
    const at = new Date(message.createdAt);
    const startsDay = !before || !sameDay(new Date(before.createdAt), at);
    const startsRun =
      startsDay ||
      !before ||
      before.sender.id !== message.sender.id ||
      at.getTime() - new Date(before.createdAt).getTime() > RUN_GAP_MS;
    return { message, startsDay, startsRun };
  });
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();

/**
 * How many messages from others came after `seenId`, the newest the viewer
 * saw at the end of the history: what's waiting below if they scrolled up.
 */
export function arrivedSince(
  messages: readonly {
    readonly id: string;
    readonly sender: { readonly id: string };
  }[],
  seenId: string | undefined,
  viewerId: string | undefined
): number {
  const seenAt = messages.findIndex(({ id }) => id === seenId);
  if (seenAt === -1) return 0;
  return messages
    .slice(seenAt + 1)
    .filter(({ sender }) => sender.id !== viewerId).length;
}
