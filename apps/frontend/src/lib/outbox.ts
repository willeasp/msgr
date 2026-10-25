/*
 * Messages the viewer sent from this page that the server hasn't yet
 * stored, shown at once at the foot of their chat's history: on their way,
 * or not sent, to be tried again. Each has the id its sender chose, which
 * it's stored under (ADR 0016), so once its history holds that id it shows
 * there instead, however it got there.
 */

/** A message on its way, or one that wasn't sent (and why, if the server said). */
export type Outgoing<M> =
  | { readonly chatId: string; readonly message: M; readonly state: 'sending' }
  | {
      readonly chatId: string;
      readonly message: M;
      readonly state: 'failed';
      readonly problem: string | null;
    };

export type Outbox<M> = readonly Outgoing<M>[];

interface Identified {
  readonly id: string;
}

/** The outbox with a message just sent to a chat, on its way. */
export const queued = <M extends Identified>(
  outbox: Outbox<M>,
  chatId: string,
  message: M
): Outbox<M> => [...outbox, { chatId, message, state: 'sending' }];

const changed = <M extends Identified>(
  outbox: Outbox<M>,
  id: string,
  change: (outgoing: Outgoing<M>) => Outgoing<M> | null
): Outbox<M> => {
  if (!outbox.some(({ message }) => message.id === id)) return outbox;
  return outbox.flatMap((outgoing) => {
    if (outgoing.message.id !== id) return [outgoing];
    const next = change(outgoing);
    return next ? [next] : [];
  });
};

/** The outbox with a message that wasn't sent. */
export const notSent = <M extends Identified>(
  outbox: Outbox<M>,
  id: string,
  problem: string | null
): Outbox<M> =>
  changed(outbox, id, ({ chatId, message }) => ({
    chatId,
    message,
    state: 'failed',
    problem,
  }));

/** The outbox with a message that wasn't sent on its way again. */
export const sendingAgain = <M extends Identified>(
  outbox: Outbox<M>,
  id: string
): Outbox<M> =>
  changed(outbox, id, ({ chatId, message }) => ({
    chatId,
    message,
    state: 'sending',
  }));

/** The outbox without a message the server has stored. */
export const stored = <M extends Identified>(
  outbox: Outbox<M>,
  id: string
): Outbox<M> => changed(outbox, id, () => null);

/** What a chat's history shows after its messages: its own outgoing ones it doesn't hold yet, in the order sent. */
export function waitingIn<M extends Identified>(
  outbox: Outbox<M>,
  chatId: string,
  history: readonly Identified[]
): Outgoing<M>[] {
  const held = new Set(history.map(({ id }) => id));
  return outbox.filter(
    (outgoing) => outgoing.chatId === chatId && !held.has(outgoing.message.id)
  );
}
