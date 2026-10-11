import { useMemo } from 'react';
import { blank } from '@msgr/bitmap';
import type { WirePicture } from '../../../lib/picture-wire';
import { usePicture } from '../../hooks/use-picture';
import { pixelSize, useBitmapCanvas } from '../../hooks/use-bitmap-canvas';
import styles from './MessagePicture.module.css';

/** A picture from the chat, in the theme's ink and paper; blank until inflated. */
export function MessagePicture({ picture }: { picture: WirePicture }) {
  const empty = useMemo(
    () => blank(picture.width, picture.height),
    [picture.width, picture.height]
  );
  const bits = usePicture(picture);
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
