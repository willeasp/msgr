import { deflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { zlibPictureCodec } from './zlib-picture-codec.js';

describe('the zlib picture codec', () => {
  it('round-trips bytes through raw DEFLATE', () => {
    const bytes = Uint8Array.from({ length: 5120 }, (_, i) => i % 7);
    const deflated = zlibPictureCodec.deflate(bytes);
    expect(deflated.length).toBeLessThan(bytes.length);
    expect(zlibPictureCodec.inflate(deflated, 5120)).toEqual(bytes);
  });

  it('stops inflating at the cap, so a small bomb never balloons', () => {
    const bomb = deflateRawSync(Buffer.alloc(100 * 1024 * 1024));
    expect(bomb.length).toBeLessThan(200 * 1024);
    expect(zlibPictureCodec.inflate(bomb, 5120)).toBeNull();
  });

  it('refuses what is not DEFLATE', () => {
    expect(zlibPictureCodec.inflate(Uint8Array.of(0xff, 0xff), 10)).toBeNull();
  });
});
