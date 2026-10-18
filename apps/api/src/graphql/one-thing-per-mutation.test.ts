import { parse, validate } from 'graphql';
import { describe, expect, it } from 'vitest';
import { oneThingPerMutation } from './one-thing-per-mutation.js';
import { schema } from './server.js';

const errorsOf = (query: string) =>
  validate(schema, parse(query), [oneThingPerMutation]).map((e) => e.message);
const send = 'sendMessage(input: { chatId: "c", content: "hi" }) { id }';

describe('a mutation does one thing', () => {
  it('takes a single field, through fragments too', () => {
    expect(errorsOf(`mutation { ${send} }`)).toEqual([]);
    expect(
      errorsOf(`mutation { ...One } fragment One on Mutation { ${send} }`)
    ).toEqual([]);
  });

  it('refuses two, by alias, inline fragment or fragment spread', () => {
    for (const query of [
      `mutation { a: ${send} b: ${send} }`,
      `mutation { a: ${send} ... on Mutation { b: ${send} } }`,
      `mutation { a: ${send} ...More } fragment More on Mutation { b: ${send} }`,
    ]) {
      expect(errorsOf(query)).toEqual([
        'A mutation may select only one field.',
      ]);
    }
  });

  it('refuses a fragment spread over and over without counting every copy', () => {
    // Each fragment spreads the next twice: 2^30 fields if each were walked.
    const chain = Array.from(
      { length: 30 },
      (_, i) => `fragment F${i} on Mutation { ...F${i + 1} ...F${i + 1} }`
    ).join(' ');
    const query = `mutation { ...F0 } ${chain} fragment F30 on Mutation { ${send} }`;
    const started = performance.now();
    expect(errorsOf(query)).toEqual(['A mutation may select only one field.']);
    expect(performance.now() - started).toBeLessThan(100);
  });
});
