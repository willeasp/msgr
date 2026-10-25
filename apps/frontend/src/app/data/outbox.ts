import { CombinedGraphQLErrors, type ApolloClient } from '@apollo/client';
import type { Bits, Frames, SoundCodes } from '@msgr/media';
import { gql } from '../../lib/__generated__';
import type { GetChatMessagesQuery } from '../../lib/__generated__/graphql';
import { toWire as movieToWire } from '../../lib/movie-wire';
import {
  notSent,
  queued,
  sendingAgain,
  stored,
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

/** What goes with a message, as it will be sent: a movie with any drawing drawn into it. */
export type Made =
  | { readonly kind: 'picture'; readonly bits: Bits }
  | { readonly kind: 'movie'; readonly frames: Frames }
  | { readonly kind: 'sound'; readonly codes: SoundCodes };

/** A send that hears nothing back in this long hasn't been sent, so far as anyone can tell. */
const SEND_TIMEOUT_MS = 60_000;

interface Waiting {
  readonly chatId: string;
  readonly content: string | null;
  readonly made: Made | null;
}

let outbox: Outbox<HistoryMessage> = [];
const listeners = new Set<() => void>();
/** What each message in the outbox is made of, to send it again. */
const making = new Map<string, Waiting>();
/** Each chat's sends, one after another, so they're stored in the order sent. */
const lines = new Map<string, Promise<void>>();
/** Bumped by a session change: a send it outlives writes nothing. */
let session = 0;

function change(next: Outbox<HistoryMessage>) {
  if (next === outbox) return;
  outbox = next;
  for (const listener of listeners) listener();
}

/**
 * Messages the viewer sent from this page that the server hasn't stored
 * yet (lib/outbox.ts): each shows at once at the foot of its chat's
 * history, from what's on the device, on its way or not sent.
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
 * Sent once `after` settles (the last typing notice), after any earlier
 * send to the same chat.
 */
export function send(
  client: ApolloClient,
  message: Waiting & {
    readonly sender: HistoryMessage['sender'];
    readonly after: Promise<unknown>;
  }
): void {
  const { chatId, content, made, sender, after } = message;
  const id = crypto.randomUUID();
  // Never fetched: kept here before anything shows them.
  const local = `local:${id}`;
  const picture =
    made?.kind === 'picture'
      ? {
          __typename: 'Picture' as const,
          width: made.bits.width,
          height: made.bits.height,
          url: local,
        }
      : null;
  const movie =
    made?.kind === 'movie'
      ? {
          __typename: 'Movie' as const,
          width: made.frames.width,
          height: made.frames.height,
          frames: made.frames.count,
          url: local,
        }
      : null;
  const sound =
    made?.kind === 'sound'
      ? {
          __typename: 'Sound' as const,
          frames: made.codes.frames,
          url: local,
        }
      : null;
  if (picture && made?.kind === 'picture') pictures.keep(picture, made.bits);
  if (movie && made?.kind === 'movie') movies.keep(movie, made.frames);
  if (sound && made?.kind === 'sound') sounds.keep(sound, made.codes);
  making.set(id, { chatId, content, made });
  change(
    queued(outbox, chatId, {
      __typename: 'Message',
      id,
      content,
      picture,
      movie,
      sound,
      sender,
      createdAt: new Date().toISOString(),
    })
  );
  inLine(client, id, after);
}

/** Sends again a message that wasn't sent: the same id, so it's stored once whatever became of the last try. */
export function tryAgain(client: ApolloClient, id: string): void {
  if (!making.has(id)) return;
  change(sendingAgain(outbox, id));
  inLine(client, id, Promise.resolve());
}

/** Forgets every message not yet sent: someone else may be signing in. */
export function forgetOutbox(): void {
  session++;
  making.clear();
  lines.clear();
  change([]);
}

function inLine(client: ApolloClient, id: string, after: Promise<unknown>) {
  const waiting = making.get(id);
  if (!waiting) return;
  // The session it was sent in, now: by the time its turn comes, someone
  // else may be signed in, and it mustn't go as theirs.
  const sentIn = session;
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
  { chatId, content, made }: Waiting,
  sentIn: number
): Promise<void> {
  if (sentIn !== session) return;
  try {
    await client.mutate({
      mutation: SEND_MESSAGE,
      variables: {
        id,
        chatId,
        content,
        picture:
          made?.kind === 'picture' ? await pictureToWire(made.bits) : null,
        movie: made?.kind === 'movie' ? movieToWire(made.frames) : null,
        sound: made?.kind === 'sound' ? soundToWire(made.codes) : null,
      },
      context: {
        fetchOptions: { signal: AbortSignal.timeout(SEND_TIMEOUT_MS) },
      },
      update: (cache, { data }) => {
        const sent = data?.sendMessage;
        if (!sent || sentIn !== session) return;
        // What was just sent is already here: kept under its real
        // addresses before it's shown, so it's never fetched back.
        if (sent.picture && made?.kind === 'picture') {
          pictures.keep(sent.picture, made.bits);
        }
        if (sent.movie && made?.kind === 'movie') {
          movies.keep(sent.movie, made.frames);
        }
        if (sent.sound && made?.kind === 'sound') {
          sounds.keep(sent.sound, made.codes);
        }
        // Sending reads everything before it.
        recordMessage(cache, sent, {
          viewerId: sent.sender.id,
          reading: true,
        });
      },
    });
    if (sentIn !== session) return;
    making.delete(id);
    change(stored(outbox, id));
  } catch (error) {
    if (sentIn !== session) return;
    // The server's reason when it refused what was sent; none when it
    // couldn't be reached, or failed.
    const refused = CombinedGraphQLErrors.is(error)
      ? error.errors.find(
          ({ extensions }) => extensions?.['code'] === 'BAD_USER_INPUT'
        )
      : undefined;
    change(notSent(outbox, id, refused?.message ?? null));
  }
}
