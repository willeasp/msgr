import { getIntrospectionQuery, parse, validate } from 'graphql';
import { describe, expect, it } from 'vitest';
import {
  boundedQueries,
  MAX_BITS,
  MAX_DEPTH,
  MAX_FIELDS,
} from './bounded-queries.js';
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
      'subscription { messageReceived { chat { messages(limit: 1) { chat { messages(limit: 1) { id } } } } } }',
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

  it('measures a fragment spread over and over only once, and counts it each time', () => {
    // Each fragment spreads the next twice: 2^30 walks if each were followed.
    const chain = Array.from(
      { length: 30 },
      (_, i) => `fragment F${i} on Chat { ...F${i + 1} ...F${i + 1} }`
    ).join(' ');
    const query = `{ chats { ...F0 } } ${chain} fragment F30 on Chat { id }`;
    const started = performance.now();
    expect(errorsOf(query)).toEqual([
      `A query may select at most ${MAX_FIELDS} fields.`,
    ]);
    expect(performance.now() - started).toBeLessThan(100);
  });

  it('refuses the same costly thing asked for again and again under aliases', () => {
    const aliases = (count: number, field: string) =>
      Array.from({ length: count }, (_, i) => `a${i}: ${field}`).join(' ');

    // A whole movie each time.
    expect(
      errorsOf(
        `{ message(id: "m") { movie { ${aliases(MAX_BITS, 'bits')} } } }`
      )
    ).toEqual([]);
    expect(
      errorsOf(
        `{ message(id: "m") { movie { ${aliases(MAX_BITS + 1, 'bits')} } } }`
      )
    ).toEqual([`A query may select bits at most ${MAX_BITS} times.`]);
    // The same, spread from fragments.
    expect(
      errorsOf(
        `{ message(id: "m") { movie { ...A ...B ...A } } }
         fragment A on Movie { ${aliases(3, 'bits')} }
         fragment B on Movie { ${aliases(3, 'bits')} }`
      )
    ).toEqual([`A query may select bits at most ${MAX_BITS} times.`]);
    // A page of history each time.
    expect(
      errorsOf(
        `{ chat(id: "c") { ${aliases(2, 'messages(limit: 100) { id }')} } }`
      )
    ).toEqual(['A query may read one history (messages) at most.']);
    // Cheap fields, but thousands of them.
    expect(errorsOf(`{ me { ${aliases(MAX_FIELDS, 'id')} } }`)).toEqual([
      `A query may select at most ${MAX_FIELDS} fields.`,
    ]);
  });

  it("lets a subscription read a chat's newest message, and no more", () => {
    expect(
      errorsOf(
        'subscription { chatAdded { chat { messages(limit: 1) { id } } } }'
      )
    ).toEqual([]);
    for (const page of [
      'messages',
      'messages(limit: 100)',
      'messages(limit: $n)',
    ]) {
      expect(
        errorsOf(
          `subscription ($n: Int) { messageReceived { chat { ${page} { movie { bits } } } } }`
        )
      ).toEqual(['A subscription may read only messages(limit: 1).']);
    }
  });

  it('leaves introspection, the size of the schema, alone', () => {
    expect(
      validate(schema, parse(getIntrospectionQuery()), [boundedQueries])
    ).toEqual([]);
  });
});
