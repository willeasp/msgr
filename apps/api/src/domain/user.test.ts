import { describe, expect, it } from 'vitest';
import {
  Avatar,
  DisplayName,
  Email,
  NewPassword,
  Profile,
  SearchTerm,
} from './user.js';
import { zlibPictureCodec } from '../infrastructure/zlib-picture-codec.js';
import { pictureInput } from '../testing/pictures.js';

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

describe('Avatar.parse', () => {
  it('takes a 64×64 picture', () => {
    const result = Avatar.parse(pictureInput(64, 64), zlibPictureCodec);

    expect(result).toMatchObject({
      ok: true,
      value: { width: 64, height: 64 },
    });
  });

  it('refuses any other size, and whatever a picture refuses', () => {
    for (const raw of [
      pictureInput(64, 63),
      pictureInput(320, 320),
      { width: 64, height: 64, bits: 'not base64!' },
    ]) {
      expect(Avatar.parse(raw, zlibPictureCodec)).toMatchObject({
        ok: false,
        error: { type: 'InvalidInput', field: 'avatar' },
      });
    }
  });
});

describe('Profile.parse', () => {
  it('parses the name and the picture, which may be none', () => {
    expect(
      Profile.parse({ name: '  Ada  ', avatar: null }, zlibPictureCodec)
    ).toEqual({ ok: true, value: { name: 'Ada', avatar: null } });
    expect(
      Profile.parse(
        { name: 'Ada', avatar: pictureInput(64, 64) },
        zlibPictureCodec
      )
    ).toMatchObject({ ok: true, value: { avatar: { width: 64 } } });
  });

  it('refuses a bad name or a bad picture', () => {
    expect(
      Profile.parse({ name: ' ', avatar: null }, zlibPictureCodec)
    ).toMatchObject({ ok: false, error: { field: 'name' } });
    expect(
      Profile.parse(
        { name: 'Ada', avatar: pictureInput(8, 8) },
        zlibPictureCodec
      )
    ).toMatchObject({ ok: false, error: { field: 'avatar' } });
  });
});
