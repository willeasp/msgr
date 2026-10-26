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
  /** When its run started, the time beside the first: every message of the run keeps its room, so the run lines up. */
  readonly runStartedAt: string;
}

/** Each message of a history, oldest first, with where its day and run start. Days are the device's. */
export function placeMessages<
  M extends {
    readonly sender: { readonly id: string };
    readonly createdAt: string;
  }
>(messages: readonly M[]): Placed<M>[] {
  let runStartedAt = '';
  return messages.map((message, index) => {
    const before = messages[index - 1];
    const at = new Date(message.createdAt);
    const startsDay = !before || !sameDay(new Date(before.createdAt), at);
    const startsRun =
      startsDay ||
      !before ||
      before.sender.id !== message.sender.id ||
      at.getTime() - new Date(before.createdAt).getTime() > RUN_GAP_MS;
    if (startsRun) runStartedAt = message.createdAt;
    return { message, startsDay, startsRun, runStartedAt };
  });
}

const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() &&
  a.getMonth() === b.getMonth() &&
  a.getDate() === b.getDate();
