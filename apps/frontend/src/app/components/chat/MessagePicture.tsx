import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { blank, type Bits } from '@msgr/bitmap';
import { fromWire, type WirePicture } from '../../../lib/picture-wire';
import { useBitmapCanvas } from '../../hooks/use-bitmap-canvas';
import styles from './MessagePicture.module.css';

/** A picture's size for CSS, which draws it at 2× (1× on a phone). */
export const pixelSize = ({ width, height }: Pick<Bits, 'width' | 'height'>) =>
  ({ '--width': width, '--height': height } as CSSProperties);

// Inflated once per session, not on every render or scroll back.
// shortcut: never evicted; a few KB each, fine until chats hold thousands.
const inflated = new Map<string, Promise<Bits | null>>();
const inflate = (picture: WirePicture) => {
  let bits = inflated.get(picture.bits);
  if (!bits) {
    bits = fromWire(picture);
    inflated.set(picture.bits, bits);
  }
  return bits;
};

/** A picture from the chat, in the theme's ink and paper; blank until inflated. */
export function MessagePicture({ picture }: { picture: WirePicture }) {
  const empty = useMemo(
    () => blank(picture.width, picture.height),
    [picture.width, picture.height]
  );
  const [bits, setBits] = useState<Bits | null>(null);
  useEffect(() => {
    let current = true;
    void inflate(picture).then((found) => current && setBits(found));
    return () => {
      current = false;
    };
  }, [picture]);
  const shown = bits ?? empty;
  const { ref } = useBitmapCanvas(shown);

  return (
    <canvas
      ref={ref}
      width={shown.width}
      height={shown.height}
      role="img"
      aria-label="Picture"
      className={styles.picture}
      style={pixelSize(shown)}
    />
  );
}

/** The picture itself, for Draw on It. */
export const pictureBits = (picture: WirePicture) => inflate(picture);
