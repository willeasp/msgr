import type { ApolloCache, ApolloClient } from '@apollo/client';
import type { Made } from '../../lib/attachment';
import { gql } from '../../lib/__generated__';
import type {
  GetChatMessagesQuery,
  MediaPart,
} from '../../lib/__generated__/graphql';
import {
  chosenId,
  notSent,
  queued,
  sendAllowance,
  sendingAgain,
  settled,
  stored,
  whyNotSent,
  withStored,
  type Outbox,
} from '../../lib/outbox';
import {
  uploadAddress,
  uploadOf,
  whyNotUploaded,
  type Upload,
} from '../../lib/upload';
import { recordMessage, recordStored } from './chats';
import { movies, pictures, sounds } from './media';

const SEND_MESSAGE = gql(`
  mutation SendMessage(
    $id: ID
    $chatId: ID!
    $content: String
    $uploaded: MediaPart
  ) {
    sendMessage(
      input: { id: $id, chatId: $chatId, content: $content, uploaded: $uploaded }
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

/**
 * A chat's history as drawn: lets go of what it holds, which it shows
 * itself. What was stored after it was fetched goes into it, in its place
 * (`recordStored`), to be let go once that's drawn; what's older than all it
 * holds is let go now, for the page before to bring.
 */
export function settle(
  cache: ApolloCache,
  chatId: string,
  history: readonly HistoryMessage[]
): void {
  change(settled(outbox, history));
  const stored = outbox.flatMap((outgoing) =>
    outgoing.chatId === chatId && outgoing.state === 'stored'
      ? [outgoing.message]
      : []
  );
  if (stored.length === 0) return;
  const placed = new Set(withStored(history, stored).map(({ id }) => id));
  change(
    outbox.filter(
      ({ chatId: chat, message, state }) =>
        chat !== chatId || state !== 'stored' || placed.has(message.id)
    )
  );
  recordStored(cache, chatId, stored);
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
    const upload = made && (await uploadOf(made));
    if (sentIn.aborted) return;
    const bytes = (content?.length ?? 0) + (upload?.bytes.length ?? 0);
    const left = since + sendAllowance(bytes) - Date.now();
    // Its time ran out waiting for its turn: not even asked.
    if (left <= 0) {
      change(notSent(outbox, id, null));
      return;
    }
    timer = setTimeout(end, left);
    // Its picture, movie or sound goes up first, on its own (ADR 0018).
    if (upload) await put(id, upload, giveUp.signal);
    const { data } = await client.mutate({
      mutation: SEND_MESSAGE,
      variables: {
        id,
        chatId,
        content,
        // The schema's name for the part (the enum's own values, kept out
        // of the first load).
        uploaded: upload && (upload.part.toUpperCase() as MediaPart),
      },
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
    const why = error instanceof NotUploaded ? error.why : whyNotSent(error);
    change(notSent(outbox, id, why));
  } finally {
    clearTimeout(timer);
    sentIn.removeEventListener('abort', end);
  }
}

/** That the server didn't take what was put, and why if it said. */
class NotUploaded extends Error {
  constructor(readonly why: string | null) {
    super(why ?? 'Not uploaded');
  }
}

/**
 * Puts a message's picture, movie or sound to its address under the
 * message's id, done once the server has it. Throws as a fetch does when it
 * can't be asked, and `NotUploaded` when it's refused.
 */
async function put(
  id: string,
  upload: Upload,
  signal: AbortSignal
): Promise<void> {
  const response = await fetch(uploadAddress(id, upload), {
    method: 'PUT',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: upload.bytes,
    signal,
  });
  if (response.ok) return;
  throw new NotUploaded(whyNotUploaded(response.status, await response.text()));
}
