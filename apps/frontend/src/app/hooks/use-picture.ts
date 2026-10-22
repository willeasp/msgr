import { useEffect, useState } from 'react';
import type { Bits } from '@msgr/media';
import { pictureBits, type WirePicture } from '../../lib/picture-wire';

/** A picture's bits once inflated; null until then, or for no picture. */
export function usePicture(picture: WirePicture | null | undefined) {
  const [inflated, setInflated] = useState<{
    picture: WirePicture;
    bits: Bits | null;
  } | null>(null);
  useEffect(() => {
    if (!picture) return;
    let current = true;
    void pictureBits(picture).then(
      (bits) => current && setInflated({ picture, bits })
    );
    return () => {
      current = false;
    };
  }, [picture]);
  // Never the last picture's bits while the next one inflates.
  return picture && inflated?.picture === picture ? inflated.bits : null;
}
