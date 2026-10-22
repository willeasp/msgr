import { useEffect, useState } from 'react';
import type { Bits } from '@msgr/media';
import type { KeptPicture } from '../../lib/picture-wire';
import { pictureAt, pictureNow } from '../data/media';

/**
 * A picture's bits once fetched and inflated; null until then, or for no
 * picture. One already here shows at once, with no blank frame first.
 */
export function usePicture(picture: KeptPicture | null | undefined) {
  const [loaded, setLoaded] = useState<{
    url: string;
    bits: Bits | null;
  } | null>(null);
  useEffect(() => {
    if (!picture || pictureNow(picture) !== undefined) return;
    let current = true;
    void pictureAt(picture).then(
      (bits) => current && setLoaded({ url: picture.url, bits })
    );
    return () => {
      current = false;
    };
  }, [picture]);
  if (!picture) return null;
  // Never the last picture's bits while the next one loads.
  const now = pictureNow(picture);
  if (now !== undefined) return now;
  return loaded?.url === picture.url ? loaded.bits : null;
}
