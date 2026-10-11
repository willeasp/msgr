import { deflateRawSync, inflateRawSync } from 'node:zlib';
import type { PictureCodec } from '../domain/picture.js';

/** Raw DEFLATE, as browsers' CompressionStream('deflate-raw') speaks it. */
export const zlibPictureCodec: PictureCodec = {
  inflate(deflated, maxBytes) {
    try {
      // Throws past maxBytes, so a tiny bomb never expands in memory.
      return new Uint8Array(
        inflateRawSync(deflated, { maxOutputLength: maxBytes })
      );
    } catch {
      return null;
    }
  },
  deflate: (bytes) => new Uint8Array(deflateRawSync(bytes, { level: 9 })),
};
