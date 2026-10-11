import { useEffect, useMemo, useState } from 'react';
import { blank, type Bits } from '@msgr/bitmap';
import { pictureBits, type WirePicture } from '../../../lib/picture-wire';
import { pixelSize, useBitmapCanvas } from '../../hooks/use-bitmap-canvas';
import styles from './MessagePicture.module.css';

/** A picture from the chat, in the theme's ink and paper; blank until inflated. */
export function MessagePicture({ picture }: { picture: WirePicture }) {
  const empty = useMemo(
    () => blank(picture.width, picture.height),
    [picture.width, picture.height]
  );
  const [bits, setBits] = useState<Bits | null>(null);
  useEffect(() => {
    let current = true;
    void pictureBits(picture).then((found) => current && setBits(found));
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
