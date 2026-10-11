import { gql } from '@apollo/client';
import { describe, expect, it } from 'vitest';
import { createCache } from './cache';

const CHAT = gql`
  query Chat {
    chat {
      id
      title
      counterpart {
        id
        name
      }
    }
  }
`;

const chat = (title: string, counterpart: string | null) => ({
  chat: {
    __typename: 'Chat',
    id: 'chat',
    title,
    counterpart: counterpart && {
      __typename: 'User',
      id: counterpart,
      name: title,
    },
  },
});

describe('createCache', () => {
  it("titles a direct chat with the other person's name as it is now", () => {
    const cache = createCache();
    cache.writeQuery({ query: CHAT, data: chat('Ada', 'ada') });

    // Ada renames herself; only her User was told.
    cache.writeFragment({
      id: 'User:ada',
      fragment: gql`
        fragment Name on User {
          name
        }
      `,
      data: { name: 'Countess' },
    });

    expect(
      cache.readQuery<{ chat: { title: string } }>({ query: CHAT })?.chat.title
    ).toBe('Countess');
  });

  it('keeps any other chat its own title', () => {
    const cache = createCache();
    cache.writeQuery({ query: CHAT, data: chat('Team', null) });

    expect(
      cache.readQuery<{ chat: { title: string } }>({ query: CHAT })?.chat.title
    ).toBe('Team');
  });
});
