import { describe, expect, it } from 'vitest';
import { zlibPictureCodec } from '../infrastructure/zlib-picture-codec.js';
import { exampleMovie } from '../testing/movies.js';
import { examplePicture } from '../testing/pictures.js';
import { exampleSound } from '../testing/sounds.js';
import { movieUpload, pictureUpload, soundUpload } from '../testing/uploads.js';
import { Movie } from './movie.js';
import { ok } from './result.js';
import { MAX_UPLOAD_BYTES, Upload, type RawUpload } from './upload.js';

const none = { picture: null, movie: null, sound: null };

describe('an upload', () => {
  it('is the picture, movie or sound its bytes are, kept as any message’s is', () => {
    for (const [{ raw, bytes }, media] of [
      [pictureUpload(), { ...none, picture: examplePicture() }],
      [movieUpload(), { ...none, movie: exampleMovie() }],
      [soundUpload(), { ...none, sound: exampleSound() }],
    ] as const) {
      expect(Upload.parse(raw, bytes, zlibPictureCodec)).toEqual(ok(media));
    }
  });

  it('is refused as its part, for what any message’s would be', () => {
    const picture = pictureUpload(13, 7).bytes;
    const movie = movieUpload(13, 7, 3).bytes;
    const cases: [RawUpload, Uint8Array, string][] = [
      // Bytes of another size.
      [{ part: 'picture', width: 7, height: 7 }, picture, 'picture'],
      [{ part: 'movie', width: 13, height: 7, frames: 49 }, movie, 'movie'],
      [
        { part: 'movie', width: 13, height: 7, frames: 3 },
        movie.slice(1),
        'movie',
      ],
      [{ part: 'sound', frames: 26 }, new Uint8Array(), 'sound'],
      // Another part's bytes.
      [{ part: 'sound', frames: 26 }, movie, 'sound'],
    ];

    for (const [raw, bytes, field] of cases) {
      expect(Upload.parse(raw, bytes, zlibPictureCodec)).toMatchObject({
        ok: false,
        error: { type: 'InvalidInput', field },
      });
    }
  });

  it('is at most as big as the largest movie', () => {
    expect(MAX_UPLOAD_BYTES).toBe(Movie.MAX_BYTES);
  });
});
