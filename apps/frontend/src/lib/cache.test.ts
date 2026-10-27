import { gql } from '@apollo/client';
import { describe, expect, it } from 'vitest';
import { createCache, mayHaveMissed } from './cache';

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
          url
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
    url: '/media/m/movie',
  };

  it('keeps its address when the chat list reads only whether there is one', () => {
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
          url
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
  const sound = { __typename: 'Sound', frames: 3, url: '/media/m/sound' };

  it('keeps its address when the chat list reads only whether there is one', () => {
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

  it("keeps the admin page's storage when asked only whether there is one", () => {
    const cache = createCache();
    const STORAGE = gql`
      query Storage {
        admin {
          storage {
            usedBytes
          }
        }
      }
    `;
    const IS_ADMIN = gql`
      query IsAdmin {
        admin {
          __typename
        }
      }
    `;
    const admin = { __typename: 'Admin' };
    cache.writeQuery({
      query: STORAGE,
      data: {
        admin: { ...admin, storage: { __typename: 'Storage', usedBytes: 9 } },
      },
    });
    cache.writeQuery({ query: IS_ADMIN, data: { admin } });

    expect(cache.readQuery({ query: STORAGE })).toMatchObject({
      admin: { storage: { usedBytes: 9 } },
    });
  });
});

const HISTORY = gql`
  query History($chatId: ID!, $before: ID) {
    messages(chatId: $chatId, limit: 2, before: $before) {
      id
      createdAt
    }
  }
`;

const page = (...ids: string[]) => ({
  messages: ids.map((id) => ({
    __typename: 'Message',
    id,
    createdAt: `2026-10-21T09:0${id}:00Z`,
  })),
});
const ids = (cache: ReturnType<typeof createCache>, chatId = 'a') =>
  cache
    .readQuery<{ messages: { id: string }[] }>({
      query: HISTORY,
      variables: { chatId },
    })
    ?.messages.map(({ id }) => id);

describe('a chat’s history in the cache', () => {
  it('is one history however it was paged, oldest first, each message once', () => {
    const cache = createCache();
    cache.writeQuery({
      query: HISTORY,
      variables: { chatId: 'a' },
      data: page('3', '4'),
    });
    cache.writeQuery({
      query: HISTORY,
      variables: { chatId: 'a', before: '3' },
      data: page('1', '2'),
    });
    // The newest again, as opening the chat asks, with one more since.
    cache.writeQuery({
      query: HISTORY,
      variables: { chatId: 'a' },
      data: page('4', '5'),
    });

    expect(ids(cache)).toEqual(['1', '2', '3', '4', '5']);
  });

  it('starts again from a newest page that doesn’t reach what it holds: what came between was missed', () => {
    // Sent while the socket was down, to a chat that wasn't open: the feed
    // never heard of 5 and 6.
    const cache = createCache();
    cache.writeQuery({
      query: HISTORY,
      variables: { chatId: 'a' },
      data: page('3', '4'),
    });
    cache.writeQuery({
      query: HISTORY,
      variables: { chatId: 'a' },
      data: page('7', '8'),
    });

    expect(ids(cache)).toEqual(['7', '8']);
  });

  it('takes an earlier page only if it is the one before what it holds', () => {
    const cache = createCache();
    cache.writeQuery({
      query: HISTORY,
      variables: { chatId: 'a' },
      data: page('3', '4'),
    });
    // Asked before 3, but the history started again while it came.
    cache.writeQuery({
      query: HISTORY,
      variables: { chatId: 'a' },
      data: page('7', '8'),
    });
    cache.writeQuery({
      query: HISTORY,
      variables: { chatId: 'a', before: '3' },
      data: page('1', '2'),
    });
    expect(ids(cache)).toEqual(['7', '8']);

    cache.writeQuery({
      query: HISTORY,
      variables: { chatId: 'a', before: '7' },
      data: page('5', '6'),
    });
    expect(ids(cache)).toEqual(['5', '6', '7', '8']);
  });

  it('sorts by when each was sent, whatever its id', () => {
    const cache = createCache();
    const at = (id: string, minute: number) => ({
      __typename: 'Message',
      id,
      createdAt: `2026-10-21T09:0${minute}:00.000Z`,
    });
    cache.writeQuery({
      query: HISTORY,
      variables: { chatId: 'a' },
      data: { messages: [at('z', 1), at('y', 3)] },
    });
    cache.writeQuery({
      query: HISTORY,
      variables: { chatId: 'a', before: 'z' },
      data: { messages: [at('x', 0)] },
    });
    cache.writeQuery({
      query: HISTORY,
      variables: { chatId: 'a' },
      data: { messages: [at('y', 3), at('w', 4)] },
    });

    expect(ids(cache)).toEqual(['x', 'z', 'y', 'w']);
  });

  describe('once events may have been missed (the socket down, the page away)', () => {
    /** What `recordMessage` does with a message the feed or a send brings. */
    const arrives = (
      cache: ReturnType<typeof createCache>,
      ...added: string[]
    ) =>
      cache.updateQuery<{ messages: unknown[] }>(
        { query: HISTORY, variables: { chatId: 'a' } },
        (existing) =>
          existing && {
            messages: [...existing.messages, ...page(...added).messages],
          }
      );

    it('takes a newest page that reaches back to what it held, and what arrived since', () => {
      const cache = createCache();
      cache.writeQuery({
        query: HISTORY,
        variables: { chatId: 'a' },
        data: page('3', '4'),
      });
      mayHaveMissed(cache);
      arrives(cache, '6');
      cache.writeQuery({
        query: HISTORY,
        variables: { chatId: 'a' },
        data: page('4', '5', '6'),
      });

      expect(ids(cache)).toEqual(['3', '4', '5', '6']);
    });

    it('starts again from a newest page that doesn’t reach back to what it held, though a message arrived on the end since', () => {
      // Held 3 and 4; 5 and 6 sent while the socket was down; 7 heard live
      // once it was back, onto the end. 4 then 7 would look like neighbours.
      const cache = createCache();
      cache.writeQuery({
        query: HISTORY,
        variables: { chatId: 'a' },
        data: page('3', '4'),
      });
      mayHaveMissed(cache);
      arrives(cache, '7');
      expect(ids(cache)).toEqual(['3', '4', '7']);

      cache.writeQuery({
        query: HISTORY,
        variables: { chatId: 'a' },
        data: page('6', '7'),
      });

      expect(ids(cache)).toEqual(['6', '7']);
    });

    it('trusts the history again once a newest page has joined it', () => {
      const cache = createCache();
      cache.writeQuery({
        query: HISTORY,
        variables: { chatId: 'a' },
        data: page('3', '4'),
      });
      mayHaveMissed(cache);
      cache.writeQuery({
        query: HISTORY,
        variables: { chatId: 'a' },
        data: page('4', '5'),
      });
      arrives(cache, '6');
      cache.writeQuery({
        query: HISTORY,
        variables: { chatId: 'a' },
        data: page('5', '6'),
      });

      expect(ids(cache)).toEqual(['3', '4', '5', '6']);
    });

    it('counts from the first time they were missed, if twice before a page', () => {
      const cache = createCache();
      cache.writeQuery({
        query: HISTORY,
        variables: { chatId: 'a' },
        data: page('3', '4'),
      });
      mayHaveMissed(cache);
      arrives(cache, '6');
      mayHaveMissed(cache);
      cache.writeQuery({
        query: HISTORY,
        variables: { chatId: 'a' },
        data: page('5', '6'),
      });

      expect(ids(cache)).toEqual(['5', '6']);
    });
  });

  it('keeps each chat’s history apart', () => {
    const cache = createCache();
    cache.writeQuery({
      query: HISTORY,
      variables: { chatId: 'a' },
      data: page('1'),
    });
    cache.writeQuery({
      query: HISTORY,
      variables: { chatId: 'b' },
      data: page('2'),
    });

    expect(ids(cache, 'a')).toEqual(['1']);
    expect(ids(cache, 'b')).toEqual(['2']);
  });
});

describe('a search’s GIFs in the cache', () => {
  const GIFS = gql`
    query Gifs($search: String, $after: String) {
      gifs(search: $search, after: $after) {
        gifs {
          id
        }
        next
      }
    }
  `;
  const page = (ids: string[], next: string | null) => ({
    gifs: {
      __typename: 'GifPage',
      gifs: ids.map((id) => ({ __typename: 'Gif', id })),
      next,
    },
  });
  const ids = (cache: ReturnType<typeof createCache>, search: string | null) =>
    cache.readQuery<{ gifs: { gifs: { id: string }[]; next: string | null } }>({
      query: GIFS,
      variables: { search },
    })?.gifs;
  const write = (
    cache: ReturnType<typeof createCache>,
    variables: { search: string | null; after?: string },
    data: ReturnType<typeof page>
  ) => cache.writeQuery({ query: GIFS, variables, data });

  it('is the first page, then the next ones as they come, each GIF once, with the last one’s cursor', () => {
    const cache = createCache();
    write(cache, { search: 'wave' }, page(['a', 'b'], '2'));
    write(cache, { search: 'wave', after: '2' }, page(['b', 'c'], '4'));

    expect(ids(cache, 'wave')).toEqual({
      __typename: 'GifPage',
      gifs: [
        { __typename: 'Gif', id: 'a' },
        { __typename: 'Gif', id: 'b' },
        { __typename: 'Gif', id: 'c' },
      ],
      next: '4',
    });
  });

  it('keeps each search apart: a page for one never joins another', () => {
    const cache = createCache();
    write(cache, { search: 'wave' }, page(['w0'], '1'));
    write(cache, { search: 'cat' }, page(['c0'], '1'));
    write(cache, { search: 'wave', after: '1' }, page(['w1'], null));

    expect(ids(cache, 'cat')?.gifs.map(({ id }) => id)).toEqual(['c0']);
    expect(ids(cache, 'wave')?.gifs.map(({ id }) => id)).toEqual(['w0', 'w1']);
    expect(ids(cache, null)).toBeUndefined();
  });

  it('takes no page but the one after what it holds, and starts again from a first page', () => {
    const cache = createCache();
    write(cache, { search: null }, page(['a'], '1'));
    write(cache, { search: null, after: '1' }, page(['b'], '2'));
    // The same More answered twice, and a page from some other point.
    write(cache, { search: null, after: '1' }, page(['b'], '2'));
    write(cache, { search: null, after: '7' }, page(['x'], '8'));
    expect(ids(cache, null)?.gifs.map(({ id }) => id)).toEqual(['a', 'b']);

    write(cache, { search: null }, page(['z'], '1'));
    expect(ids(cache, null)?.gifs.map(({ id }) => id)).toEqual(['z']);
  });
});
