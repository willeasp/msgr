import {
  InMemoryCache,
  type ApolloCache,
  type FieldFunctionOptions,
  type Reference,
} from '@apollo/client';

/** Where a message stands in its chat's history: the server's own order. */
const keyOf =
  (readField: FieldFunctionOptions['readField']) => (message: Reference) =>
    `${readField<string>('createdAt', message)} ${readField<string>(
      'id',
      message
    )}`;

/**
 * A chat's history, oldest first, each message once: one unbroken run per
 * chat however it was paged. An earlier page joins only the history it was
 * asked of. A newest page (opening the chat, catching up) joins what's held
 * if it holds all of it or reaches back into it; otherwise what came between
 * was missed, and the history starts again from it, keeping only what's
 * newer. What's held is whole up to its newest message, unless events may
 * have been missed since (`mayHaveMissed`): then only up to the newest held
 * then, since what arrived after it may follow a gap.
 */
const history = {
  keyArgs: ['chatId'],
  merge(
    existing: readonly Reference[] = [],
    incoming: readonly Reference[],
    { args, readField, storage }: FieldFunctionOptions
  ) {
    const key = keyOf(readField);
    const held = new Map(existing.map((message) => [key(message), message]));
    const came = new Map(incoming.map((message) => [key(message), message]));
    if (args?.['before']) {
      const oldest = existing[0];
      if (oldest && readField('id', oldest) !== args['before']) return existing;
    } else if ([...held.keys()].some((at) => !came.has(at))) {
      // A newest page from the server, rather than what's held with what
      // the feed or a send brought (recordMessage), which holds all of it.
      const wholeTo: string | undefined =
        storage['wholeTo'] ?? [...held.keys()].at(-1);
      delete storage['wholeTo'];
      let earliest: string | undefined;
      for (const at of came.keys()) {
        if (earliest === undefined || at < earliest) earliest = at;
      }
      if (
        earliest !== undefined &&
        wholeTo !== undefined &&
        earliest > wholeTo
      ) {
        for (const at of held.keys()) if (at < earliest) held.delete(at);
      }
    }
    return [...new Map([...held, ...came])]
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
      .map(([, message]) => message);
  },
};

/**
 * Says events may have been missed (the socket was down, the page away):
 * every history held is whole only up to its newest message now, until a
 * newest page reaches back to it.
 */
export function mayHaveMissed(cache: ApolloCache) {
  cache.modify({
    id: 'ROOT_QUERY',
    fields: {
      messages(existing: readonly Reference[], { readField, storage }) {
        const newest = existing.at(-1);
        if (newest && storage['wholeTo'] === undefined) {
          storage['wholeTo'] = keyOf(readField)(newest);
        }
        return existing;
      },
    },
  });
}

/**
 * Apollo's cache, holding each person once, by id. A direct chat's title is
 * the other person's name, so it is read from them rather than kept twice:
 * when they rename themselves, every title that shows them follows. A
 * message's picture, movie and sound are merged, however little of them a
 * query reads, and a chat's history is one list however it was paged.
 */
export const createCache = () =>
  new InMemoryCache({
    typePolicies: {
      Query: { fields: { messages: history } },
      // The admin page has no id: the menu bar asks only whether it's there
      // (GetMe), the page reads its storage, and neither may wipe the other.
      Admin: { merge: true },
      // A movie or sound has no id of its own: the chat list's preview
      // reads only that there is one, and mustn't wipe the bits the history
      // read. Get Info reads only a picture's size, and a movie's.
      Message: {
        fields: {
          picture: { merge: true },
          movie: { merge: true },
          sound: { merge: true },
        },
      },
      Chat: {
        fields: {
          title: {
            read(title: string, { readField }) {
              const counterpart = readField<Reference | null>('counterpart');
              return (
                (counterpart && readField<string>('name', counterpart)) ?? title
              );
            },
          },
        },
      },
    },
  });
