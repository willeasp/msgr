import type { ApolloClient } from '@apollo/client';
import type { Made } from '../../lib/attachment';
import { gql } from '../../lib/__generated__';
import type { GetChatMessagesQuery } from '../../lib/__generated__/graphql';
import { toWire as movieToWire } from '../../lib/movie-wire';
import {
  chosenId,
  notSent,
  queued,
  sendAllowance,
  sendingAgain,
  settled,
  stored,
  whyNotSent,
  type Outbox,
} from '../../lib/outbox';
import { toWire as pictureToWire } from '../../lib/picture-wire';
import { toWire as soundToWire } from '../../lib/sound-wire';
import { recordMessage } from './chats';
import { movies, pictures, sounds } from './media';

const SEND_MESSAGE = gql(`
  mutation SendMessage(
    $id: ID
    $chatId: ID!
    $content: String
    $picture: PictureInput
    $movie: MovieInput
    $sound: SoundInput
  ) {
    sendMessage(
      input: {
        id: $id
        chatId: $chatId
        content: $content
        picture: $picture
        movie: $movie
        sound: $sound
      }
    ) {
      id
      content
      picture {
        width
        height
        url
      }
      movie {
        width
        height
        frames
        url
      }
      sound {
        frames
        url
      }
      createdAt
      sender {
        id
        name
        avatar {
          width
          height
          url
        }
      }
      chat {
        id
        kind
        title
        counterpart {
          id
          name
          avatar {
            width
            height
            url
          }
        }
        participants {
          id
          name
        }
      }
    }
  }
`);

/** A message as a chat's history shows it. */
export type HistoryMessage = GetChatMessagesQuery['messages'][number];

/** The longest a message waits for the last typing notice: one that hangs mustn't hold it. */
const TYPING_WAIT_MS = 2_000;

interface Waiting {
  readonly chatId: string;
  readonly content: string | null;
  readonly made: Made | null;
}

let outbox: Outbox<HistoryMessage> = [];
const listeners = new Set<() => void>();
/** What each message on its way or not sent is made of, to send it (again), and since when it's been tried. */
const making = new Map<string, Waiting & { readonly since: number }>();
/** Each chat's sends, one after another, so they're stored in the order sent. */
const lines = new Map<string, Promise<void>>();
/** Ends with the session: a send it outlives is let go, and writes nothing. */
let session = new AbortController();

function change(next: Outbox<HistoryMessage>) {
  if (next === outbox) return;
  outbox = next;
  // Only what's in the outbox is made of anything still.
  for (const id of making.keys()) {
    if (
      !outbox.some(
        ({ message, state }) => message.id === id && state !== 'stored'
      )
    ) {
      making.delete(id);
    }
  }
  for (const listener of listeners) listener();
}

/**
 * Messages the viewer sent from this page that their chat's history
 * doesn't hold yet (lib/outbox.ts): each shows at once at its foot, from
 * what's on the device, on its way, not sent, or stored.
 */
export const outgoing = {
  now: () => outbox,
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/**
 * Sends a message, showing it at once: under an id chosen here, which the
 * server stores it under (ADR 0016), with its picture, movie or sound kept
 * as made under addresses of its own until the server gives it real ones.
 * Sent once `after` settles (the last typing notice) or a moment has
 * passed, after any earlier send to the same chat.
 */
export function send(
  client: ApolloClient,
  message: Waiting & {
    readonly sender: HistoryMessage['sender'];
    readonly after: Promise<unknown>;
  }
): void {
  const { chatId, content, made, sender, after } = message;
  const id = chosenId((bytes) => crypto.getRandomValues(bytes));
  // Never fetched: kept here before anything shows them.
  const local = `local:${id}`;
  const shown = {
    picture:
      made?.kind === 'picture'
        ? {
            __typename: 'Picture' as const,
            width: made.bits.width,
            height: made.bits.height,
            url: local,
          }
        : null,
    movie:
      made?.kind === 'movie'
        ? {
            __typename: 'Movie' as const,
            width: made.frames.width,
            height: made.frames.height,
            frames: made.frames.count,
            url: local,
          }
        : null,
    sound:
      made?.kind === 'sound'
        ? {
            __typename: 'Sound' as const,
            frames: made.codes.frames,
            url: local,
          }
        : null,
  };
  keep(shown, made);
  making.set(id, { chatId, content, made, since: Date.now() });
  change(
    queued(outbox, chatId, {
      __typename: 'Message',
      id,
      content,
      ...shown,
      sender,
      createdAt: new Date().toISOString(),
    })
  );
  inLine(
    client,
    id,
    Promise.race([
      after,
      new Promise((done) => setTimeout(done, TYPING_WAIT_MS)),
    ])
  );
}

/** Sends again a message that wasn't sent: the same id, so it's stored once whatever became of the last try. */
export function tryAgain(client: ApolloClient, id: string): void {
  const waiting = making.get(id);
  const next = sendingAgain(outbox, id);
  if (!waiting || next === outbox) return;
  making.set(id, { ...waiting, since: Date.now() });
  change(next);
  inLine(client, id, Promise.resolve());
}

/**
 * A message the feed brought: if it's one sent from here, it's stored, and
 * what it's made of is here already, under its real addresses before it's
 * shown, so it's never fetched back.
 */
export function received(message: HistoryMessage): void {
  const waiting = making.get(message.id);
  if (!waiting) return;
  keep(message, waiting.made);
  change(stored(outbox, message.id, message));
}

/** Lets go of what a chat's history now holds: it shows those itself. */
export function settle(history: readonly { readonly id: string }[]): void {
  change(settled(outbox, history));
}

/** Forgets every message not yet stored, and lets go of any on its way: someone else may be signing in. */
export function forgetOutbox(): void {
  session.abort();
  session = new AbortController();
  making.clear();
  lines.clear();
  change([]);
}

/** Keeps what a message is made of under its addresses, so nothing fetches it. */
function keep(
  {
    picture,
    movie,
    sound,
  }: Pick<HistoryMessage, 'picture' | 'movie' | 'sound'>,
  made: Made | null
) {
  if (picture && made?.kind === 'picture') pictures.keep(picture, made.bits);
  if (movie && made?.kind === 'movie') movies.keep(movie, made.frames);
  if (sound && made?.kind === 'sound') sounds.keep(sound, made.codes);
}

function inLine(client: ApolloClient, id: string, after: Promise<unknown>) {
  const waiting = making.get(id);
  if (!waiting) return;
  // The session it was sent in, now: by the time its turn comes, someone
  // else may be signed in, and it mustn't go as theirs.
  const sentIn = session.signal;
  const before = lines.get(waiting.chatId) ?? Promise.resolve();
  lines.set(
    waiting.chatId,
    Promise.all([before, after.catch(() => undefined)]).then(() =>
      deliver(client, id, waiting, sentIn)
    )
  );
}

async function deliver(
  client: ApolloClient,
  id: string,
  { chatId, content, made, since }: Waiting & { readonly since: number },
  sentIn: AbortSignal
): Promise<void> {
  // Stored meanwhile (the feed brought it), or forgotten.
  if (sentIn.aborted || !making.has(id)) return;
  // Given up on when the session ends, or once it's had its time since it
  // was sent, however long it waited for its turn.
  const giveUp = new AbortController();
  const end = () => giveUp.abort();
  sentIn.addEventListener('abort', end);
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const variables = {
      id,
      chatId,
      content,
      picture: made?.kind === 'picture' ? await pictureToWire(made.bits) : null,
      movie: made?.kind === 'movie' ? movieToWire(made.frames) : null,
      sound: made?.kind === 'sound' ? soundToWire(made.codes) : null,
    };
    if (sentIn.aborted) return;
    const bytes =
      (content?.length ?? 0) +
      (variables.picture?.bits.length ?? 0) +
      (variables.movie?.bits.length ?? 0) +
      (variables.sound?.bits.length ?? 0);
    const left = since + sendAllowance(bytes) - Date.now();
    // Its time ran out waiting for its turn: not even asked.
    if (left <= 0) {
      change(notSent(outbox, id, null));
      return;
    }
    timer = setTimeout(end, left);
    const { data } = await client.mutate({
      mutation: SEND_MESSAGE,
      variables,
      // Written to the cache below, by recordMessage alone, and only if
      // the session it was sent in is still the page's.
      fetchPolicy: 'no-cache',
      context: { fetchOptions: { signal: giveUp.signal } },
    });
    const sent = data?.sendMessage;
    if (!sent) throw new Error('The answer to a send holds no message');
    if (sentIn.aborted) return;
    keep(sent, made);
    // Sending reads everything before it.
    recordMessage(client.cache, sent, {
      viewerId: sent.sender.id,
      reading: true,
    });
    change(stored(outbox, id, sent));
  } catch (error) {
    if (sentIn.aborted) return;
    change(notSent(outbox, id, whyNotSent(error)));
  } finally {
    clearTimeout(timer);
    sentIn.removeEventListener('abort', end);
  }
}
