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

describe("a message's movie", () => {
  const FULL = gql`
    query Full {
      message {
        id
        movie {
          width
          height
          frames
          bits
        }
      }
    }
  `;
  const PREVIEW = gql`
    query Preview {
      message {
        id
        movie {
          frames
        }
      }
    }
  `;
  const movie = {
    __typename: 'Movie',
    width: 8,
    height: 8,
    frames: 3,
    bits: 'AAAA',
  };

  it('keeps its bits when the chat list reads only whether there is one', () => {
    const cache = createCache();
    cache.writeQuery({
      query: FULL,
      data: { message: { __typename: 'Message', id: 'm', movie } },
    });
    cache.writeQuery({
      query: PREVIEW,
      data: {
        message: {
          __typename: 'Message',
          id: 'm',
          movie: { __typename: 'Movie', frames: 3 },
        },
      },
    });

    expect(cache.readQuery({ query: FULL })).toEqual({
      message: { __typename: 'Message', id: 'm', movie },
    });
  });
});

describe("a message's sound", () => {
  const FULL = gql`
    query Full {
      message {
        id
        sound {
          frames
          bits
        }
      }
    }
  `;
  const PREVIEW = gql`
    query Preview {
      message {
        id
        sound {
          frames
        }
      }
    }
  `;
  const sound = { __typename: 'Sound', frames: 3, bits: 'AAAA' };

  it('keeps its bits when the chat list reads only whether there is one', () => {
    const cache = createCache();
    cache.writeQuery({
      query: FULL,
      data: { message: { __typename: 'Message', id: 'm', sound } },
    });
    cache.writeQuery({
      query: PREVIEW,
      data: {
        message: {
          __typename: 'Message',
          id: 'm',
          sound: { __typename: 'Sound', frames: 3 },
        },
      },
    });

    expect(cache.readQuery({ query: FULL })).toEqual({
      message: { __typename: 'Message', id: 'm', sound },
    });
  });
});
