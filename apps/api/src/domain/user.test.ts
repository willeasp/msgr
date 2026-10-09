import { describe, expect, it } from 'vitest';
import { Email, SearchTerm } from './user.js';

describe('Email.parse', () => {
  it('trims and lower-cases', () => {
    expect(Email.parse('  Ada@Example.COM ')).toEqual({
      ok: true,
      value: 'ada@example.com',
    });
  });

  it.each(['', 'ada', '@example.com', 'ada@', 'a da@example.com'])(
    'rejects %j',
    (raw) => {
      expect(Email.parse(raw)).toMatchObject({
        ok: false,
        error: { type: 'InvalidInput', field: 'email' },
      });
    }
  );

  it('rejects addresses longer than 254 characters', () => {
    expect(Email.parse(`${'a'.repeat(250)}@x.io`).ok).toBe(false);
  });
});

describe('SearchTerm.parse', () => {
  it('trims', () => {
    expect(SearchTerm.parse('  ada ')).toEqual({ ok: true, value: 'ada' });
  });

  it('rejects blank and overlong terms', () => {
    expect(SearchTerm.parse('   ')).toMatchObject({
      ok: false,
      error: { field: 'query' },
    });
    expect(SearchTerm.parse('x'.repeat(SearchTerm.MAX_LENGTH + 1)).ok).toBe(
      false
    );
  });
});
