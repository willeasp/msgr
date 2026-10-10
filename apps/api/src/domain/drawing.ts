import type { Brand } from './brand.js';
import { invalidInput, type InvalidInput } from './errors.js';
import { err, ok, type Result } from './result.js';

/**
 * A 256×160 black-and-white picture: rows top to bottom, 8 pixels a byte with
 * the leftmost in the high bit, 1 for ink, in standard base64. Never blank.
 */
export type Drawing = Brand<string, 'Drawing'>;
export const Drawing = {
  WIDTH: 256,
  HEIGHT: 160,
  BYTES: (256 * 160) / 8,
  /** Base64 of `BYTES`: 4 characters for every 3 bytes, padded. */
  ENCODED_LENGTH: 4 * Math.ceil((256 * 160) / 8 / 3),
  parse(raw: string): Result<Drawing, InvalidInput> {
    const wrongSize = invalidInput(
      'drawing',
      `Drawing must be ${Drawing.WIDTH}×${Drawing.HEIGHT} pixels`
    );
    // Before decoding, so an oversized string costs nothing.
    if (raw.length !== Drawing.ENCODED_LENGTH) return err(wrongSize);
    let bytes: string;
    try {
      bytes = atob(raw);
    } catch {
      return err(invalidInput('drawing', 'Drawing must be base64'));
    }
    // atob forgives whitespace and missing padding; one spelling per picture.
    if (btoa(bytes) !== raw) {
      return err(invalidInput('drawing', 'Drawing must be base64'));
    }
    if (bytes.length !== Drawing.BYTES) return err(wrongSize);
    if (!/[^\0]/.test(bytes)) {
      return err(invalidInput('drawing', 'Drawing must not be blank'));
    }
    return ok(raw as Drawing);
  },
};
