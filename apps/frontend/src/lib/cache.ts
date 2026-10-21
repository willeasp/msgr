import { InMemoryCache, type Reference } from '@apollo/client';

/**
 * Apollo's cache, holding each person once, by id. A direct chat's title is
 * the other person's name, so it is read from them rather than kept twice:
 * when they rename themselves, every title that shows them follows. A
 * message's movie and sound are merged, however little of them a query
 * reads.
 */
export const createCache = () =>
  new InMemoryCache({
    typePolicies: {
      // A movie or sound has no id of its own: the chat list's preview
      // reads only that there is one, and mustn't wipe the bits the history
      // read.
      Message: {
        fields: { movie: { merge: true }, sound: { merge: true } },
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
