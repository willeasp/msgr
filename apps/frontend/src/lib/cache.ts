import { InMemoryCache, type Reference } from '@apollo/client';

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
      Query: {
        fields: {
          // A chat's history however it was paged (earlier pages, and the
          // newest again on opening): one unbroken run per chat, oldest
          // first, each message once.
          messages: {
            keyArgs: ['chatId'],
            merge(
              existing: readonly Reference[] = [],
              incoming: readonly Reference[],
              { readField, args }
            ) {
              const key = (message: Reference) =>
                `${readField<string>('createdAt', message)} ${readField<string>(
                  'id',
                  message
                )}`;
              const byKey = (messages: readonly Reference[]) =>
                [...new Map(messages.map((m) => [key(m), m]))].sort(
                  ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)
                );
              const pageOf = byKey(incoming);
              const oldest = existing[0];
              const newest = existing.at(-1);
              const earliest = pageOf[0]?.[0];
              let held = existing;
              if (args?.['before']) {
                // A page before the oldest held, or one asked of a history
                // that has started again since, which adjoins nothing.
                if (oldest && readField('id', oldest) !== args['before']) {
                  return existing;
                }
              } else if (newest && earliest && earliest > key(newest)) {
                // The newest page, wholly after what's held: what came
                // between was missed (sent while the socket was down, to a
                // chat not open), so the history starts again from it.
                held = [];
              }
              return byKey([...held, ...incoming]).map(([, m]) => m);
            },
          },
        },
      },
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
