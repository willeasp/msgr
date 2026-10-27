import type { InvalidInput, Unavailable } from '../domain/errors.js';
import {
  GifOffset,
  GifSearch,
  GiphyMedia,
  type GifPage,
} from '../domain/gif.js';
import { ok, type Result } from '../domain/result.js';
import type { User } from '../domain/user.js';
import type { Dependencies, GiphyFile } from './ports.js';

export type GifService = ReturnType<typeof createGifService>;

/** GIFs from GIPHY, for whoever is signed in, while the server has a key for it. */
export function createGifService({ giphy }: Dependencies) {
  return {
    /** Whether GIFs can be searched: the server has a GIPHY_API_KEY. */
    on: (): boolean => giphy !== null,

    /**
     * A page of GIFs for the words, or of what's trending without any, from
     * where `after` says the page before ended. Null while GIFs are off.
     */
    async search(
      _viewer: User,
      rawWords: string | null,
      after: string | null
    ): Promise<Result<GifPage | null, InvalidInput | Unavailable>> {
      if (!giphy) return ok(null);
      const words = GifSearch.parse(rawWords ?? '');
      if (!words.ok) return words;
      const offset =
        after === null ? ok(GifOffset.FIRST) : GifOffset.parse(after);
      if (!offset.ok) return offset;
      return giphy.search(words.value, offset.value);
    },

    /** A still or a movie GIPHY gave, from its own address; null for any other address, or while GIFs are off. */
    async file(_viewer: User, rawUrl: string): Promise<GiphyFile | null> {
      const url = GiphyMedia.parse(rawUrl);
      return giphy && url ? giphy.file(url) : null;
    },
  };
}
