import { CombinedGraphQLErrors } from '@apollo/client/errors';

/*
 * Messages the viewer sent from this page, shown at once at the foot of
 * their chat's history until it holds them: on their way, not sent (to be
 * tried again), or stored and waiting for the history to show them. Each
 * has the id its sender chose, which it's stored under (ADR 0016), so the
 * history shows it in their place the moment it holds that id, however it
 * got there; until then, nothing that comes late can take it back a step.
 */

/**
 * A message sent from this page: on its way; not sent, and why if the
 * server said; or stored, as the server answered or the feed brought it,
 * until its chat's history holds it too.
 */
export type Outgoing<M> =
  | { readonly chatId: string; readonly message: M; readonly state: 'sending' }
  | {
      readonly chatId: string;
      readonly message: M;
      readonly state: 'notSent';
      readonly problem: string | null;
    }
  | { readonly chatId: string; readonly message: M; readonly state: 'stored' };

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

/** The outbox with one message moved on, if it's in one of the states it moves on from; else the same outbox. */
function moved<M extends Identified>(
  outbox: Outbox<M>,
  id: string,
  from: readonly Outgoing<M>['state'][],
  to: (outgoing: Outgoing<M>) => Outgoing<M>
): Outbox<M> {
  const at = outbox.findIndex(({ message }) => message.id === id);
  const outgoing = outbox[at];
  if (!outgoing || !from.includes(outgoing.state)) return outbox;
  const next = to(outgoing);
  return outbox.map((each, index) => (index === at ? next : each));
}

/** The outbox with a message on its way that didn't get there. Nothing else becomes not sent: a stored one's late failure changes nothing. */
export const notSent = <M extends Identified>(
  outbox: Outbox<M>,
  id: string,
  problem: string | null
): Outbox<M> =>
  moved(outbox, id, ['sending'], ({ chatId, message }) => ({
    chatId,
    message,
    state: 'notSent',
    problem,
  }));

/**
 * The outbox with a message that wasn't sent on its way again, last: it's
 * stored after whatever was sent meanwhile, so it shows after it too.
 */
export function sendingAgain<M extends Identified>(
  outbox: Outbox<M>,
  id: string
): Outbox<M> {
  const next = moved(outbox, id, ['notSent'], ({ chatId, message }) => ({
    chatId,
    message,
    state: 'sending',
  }));
  if (next === outbox) return outbox;
  return [
    ...next.filter(({ message }) => message.id !== id),
    ...next.filter(({ message }) => message.id === id),
  ];
}

/**
 * The outbox with a message the server has stored, as it was stored, until
 * its history holds it: whichever came first, the answer or the feed. A
 * message not sent may have been stored all the same (its answer lost).
 */
export const stored = <M extends Identified>(
  outbox: Outbox<M>,
  id: string,
  message: M
): Outbox<M> =>
  moved(outbox, id, ['sending', 'notSent'], ({ chatId }) => ({
    chatId,
    message,
    state: 'stored',
  }));

/** The outbox without the messages a history holds, whatever their state: holding one is proof it's stored. Else the same outbox. */
export function settled<M extends Identified>(
  outbox: Outbox<M>,
  history: readonly Identified[]
): Outbox<M> {
  if (outbox.length === 0) return outbox;
  const held = new Set(history.map(({ id }) => id));
  const next = outbox.filter(({ message }) => !held.has(message.id));
  return next.length === outbox.length ? outbox : next;
}

interface Dated extends Identified {
  readonly createdAt: string;
}

/** Whether `a` was stored before `b`, as the server orders a history: by time, then id. */
const before = (a: Dated, b: Dated) => {
  const at = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  return at < 0 || (at === 0 && a.id < b.id);
};

/**
 * A history with messages the server stored that it doesn't hold (it was
 * fetched before they were stored), each in its place, so what arrives
 * later goes after it. One older than all it holds is left out: the
 * history doesn't reach back to it (it started again from a later page),
 * and the page before brings it.
 */
export function withStored<M extends Dated>(
  history: readonly M[],
  stored: readonly M[]
): readonly M[] {
  const oldest = history[0];
  const placed = stored
    .filter(
      (message) =>
        !history.some(({ id }) => id === message.id) &&
        !(oldest && before(message, oldest))
    )
    .reduce<readonly M[]>((into, message) => {
      const at = into.findIndex((held) => before(message, held));
      return at === -1
        ? [...into, message]
        : [...into.slice(0, at), message, ...into.slice(at)];
    }, history);
  return placed.length === history.length ? history : placed;
}

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

/** The most a message's words may be, trimmed, as the server counts them (UTF-16 units, `MessageContent.MAX_LENGTH`). */
export const MAX_LENGTH = 4000;

/** Why words can't be sent as they are, for the composer to say before sending what the server would only refuse; null when they can. */
export const tooLong = (content: string): string | null =>
  content.length > MAX_LENGTH
    ? `A message can be at most ${MAX_LENGTH.toLocaleString(
        'en'
      )} characters. This one is ${content.length.toLocaleString('en')}.`
    : null;

/**
 * Why a message wasn't sent, as Not Sent. says it: the server's reason when
 * it refused what was sent (too long, say); none when it couldn't be
 * reached, failed, or took too long.
 */
export function whyNotSent(error: unknown): string | null {
  if (!CombinedGraphQLErrors.is(error)) return null;
  const refused = error.errors.find(
    ({ extensions }) => extensions?.['code'] === 'BAD_USER_INPUT'
  );
  return refused?.message ?? null;
}

/**
 * How long a send may go without an answer, from the moment it was sent,
 * before it's taken for not sent: a minute, and as long again as its bytes
 * take at 16 kB a second, a slow phone network's upload.
 */
export const sendAllowance = (bytes: number): number =>
  60_000 + Math.ceil(bytes / 16);

/**
 * A version 4 UUID, the id a message is sent under, from 16 random bytes
 * however they're made: `crypto.randomUUID` is only for secure pages, and a
 * phone trying the app over a home network's plain http has none.
 */
export function chosenId(fill: (bytes: Uint8Array) => unknown): string {
  const bytes = new Uint8Array(16);
  fill(bytes);
  // The version, 4, and the variant, 10xx.
  bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x40;
  bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
  const hex = Array.from(bytes, (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join('-');
}
