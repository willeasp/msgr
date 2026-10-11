import { InMemoryCache, type Reference } from '@apollo/client';

/**
 * Apollo's cache, holding each person once, by id. A direct chat's title is
 * the other person's name, so it is read from them rather than kept twice:
 * when they rename themselves, every title that shows them follows.
 */
export const createCache = () =>
  new InMemoryCache({
    typePolicies: {
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
