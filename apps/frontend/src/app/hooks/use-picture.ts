import type { KeptPicture } from '../../lib/picture-wire';
import { pictures } from '../data/media';
import { useMedia } from './use-media';

/**
 * A picture's bits once fetched and inflated; null until then, or for no
 * picture. One already here shows at once, with no blank frame first; any
 * other is fetched once `near`.
 */
export const usePicture = (
  picture: KeptPicture | null | undefined,
  near = true
) => useMedia(pictures, picture, near);
