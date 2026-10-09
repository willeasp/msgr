import { describe, expect, it } from 'vitest';
import { DisplayName, Email, NewPassword, SearchTerm } from './user.js';

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

describe('DisplayName.parse', () => {
  it('trims', () => {
    expect(DisplayName.parse('  Ada Lovelace ')).toEqual({
      ok: true,
      value: 'Ada Lovelace',
    });
  });

  it('rejects blank and overlong names', () => {
    expect(DisplayName.parse('   ')).toMatchObject({
      ok: false,
      error: { type: 'InvalidInput', field: 'name' },
    });
    expect(DisplayName.parse('x'.repeat(DisplayName.MAX_LENGTH + 1)).ok).toBe(
      false
    );
  });
});

describe('NewPassword.parse', () => {
  it('keeps the password exactly as typed', () => {
    expect(NewPassword.parse(' correct horse ')).toEqual({
      ok: true,
      value: ' correct horse ',
    });
  });

  it('needs at least 8 characters', () => {
    expect(NewPassword.parse('1234567')).toMatchObject({
      ok: false,
      error: { type: 'InvalidInput', field: 'password' },
    });
  });

  it('refuses more than bcrypt reads: 72 bytes, not characters', () => {
    expect(NewPassword.parse('a'.repeat(72)).ok).toBe(true);
    expect(NewPassword.parse('a'.repeat(73)).ok).toBe(false);
    // Each "é" is two bytes in UTF-8.
    expect(NewPassword.parse('é'.repeat(37)).ok).toBe(false);
  });
});
