import {
  blank,
  decodeMovie,
  decodeSound,
  frameOf,
  setPixel,
  type Frames,
} from '@msgr/media';
import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { uploadAddress, uploadOf, whyNotUploaded } from './upload';

const ID = '3f0e1c2a-9b4d-4c8e-a1f2-0123456789ab';

const movie = (): Frames => {
  const frames = { width: 13, height: 7, count: 3, bytes: new Uint8Array(42) };
  for (let f = 0; f < 3; f++) setPixel(frameOf(frames, f), f, 6, true);
  return frames;
};

describe('an upload', () => {
  it('is a picture raw-DEFLATEd, a movie or a sound coded, as the server keeps them', async () => {
    const bits = blank(13, 7);
    setPixel(bits, 12, 6, true);
    const picture = await uploadOf({ kind: 'picture', bits });
    expect(picture).toMatchObject({
      part: 'picture',
      size: { width: 13, height: 7 },
    });
    expect(new Uint8Array(inflateRawSync(picture.bytes))).toEqual(bits.bytes);

    const moving = await uploadOf({ kind: 'movie', frames: movie() });
    expect(moving).toMatchObject({
      part: 'movie',
      size: { width: 13, height: 7, frames: 3 },
    });
    expect(decodeMovie(moving.bytes, 13, 7, 3)).toEqual(movie());

    const codes = decodeSound(new Uint8Array(), 2);
    const sound = await uploadOf({ kind: 'sound', codes });
    expect(sound).toMatchObject({ part: 'sound', size: { frames: 2 } });
    expect(decodeSound(sound.bytes, 2)).toEqual(codes);
  });

  it('goes to its message’s own address, with its size', async () => {
    expect(
      uploadAddress(ID, await uploadOf({ kind: 'movie', frames: movie() }))
    ).toBe(`/media/${ID}/movie?width=13&height=7&frames=3`);
    expect(
      uploadAddress(ID, {
        part: 'sound',
        size: { frames: 26 },
        bytes: new Uint8Array(),
      })
    ).toBe(`/media/${ID}/sound?frames=26`);
  });

  it('says why the server refused it, and nothing when it failed', () => {
    expect(whyNotUploaded(422, 'Picture must not be blank')).toBe(
      'Picture must not be blank'
    );
    expect(whyNotUploaded(422, '')).toBeNull();
    for (const status of [401, 404, 413, 500, 502]) {
      expect(whyNotUploaded(status, '<html>Bad Gateway</html>')).toBeNull();
    }
  });
});
