import { parse, validate } from 'graphql';
import { describe, expect, it } from 'vitest';
import { boundedQueries, MAX_DEPTH } from './bounded-queries.js';
import { schema } from './server.js';

const errorsOf = (query: string) =>
  validate(schema, parse(query), [boundedQueries]).map((e) => e.message);
const NESTED = 'A query may not read messages inside messages.';

describe('a query asks for bounded work', () => {
  it("takes the app's own queries", () => {
    expect(
      errorsOf(`{
        chats { id counterpart { avatar { url } } messages(limit: 1) { id content } }
        message(id: "m") { readBy { reader { avatar { url } } } chat { title } }
      }`)
    ).toEqual([]);
    expect(
      errorsOf(
        'subscription { messageReceived { chat { participants { id } } } }'
      )
    ).toEqual([]);
  });

  it('refuses a history inside a history, however it is reached', () => {
    for (const query of [
      '{ chats { messages { chat { messages { id } } } } }',
      '{ messages(chatId: "c") { chat { messages { id } } } }',
      '{ chats { messages { ...Back } } } fragment Back on Message { chat { messages { id } } }',
      '{ chats { messages { ... on Message { chat { ...History } } } } } fragment History on Chat { messages { id } }',
      'subscription { messageReceived { chat { messages { chat { messages { id } } } } } }',
    ]) {
      expect(errorsOf(query)).toEqual([NESTED]);
    }
  });

  it(`refuses a query more than ${MAX_DEPTH} fields deep`, () => {
    // Today no path goes this deep without a history inside a history; the
    // cap holds for the schema to come. Measured alone, the rule doesn't need
    // the fields to exist.
    const around = (depth: number): string =>
      depth <= 1 ? 'id' : `chat { participants { ${around(depth - 2)} } }`;
    const deep = `{ message(id: "m") { ${around(MAX_DEPTH + 2)} } }`;
    expect(errorsOf(deep)).toEqual([
      `A query may go at most ${MAX_DEPTH} fields deep.`,
    ]);
  });

  it('measures a fragment spread over and over only once', () => {
    // Each fragment spreads the next twice: 2^30 walks if each were followed.
    const chain = Array.from(
      { length: 30 },
      (_, i) => `fragment F${i} on Chat { ...F${i + 1} ...F${i + 1} }`
    ).join(' ');
    const query = `{ chats { ...F0 } } ${chain} fragment F30 on Chat { id }`;
    const started = performance.now();
    expect(errorsOf(query)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(100);
  });
});
