import { useMemo, useRef } from 'react';
import { blank } from '@msgr/media';
import type { KeptPicture } from '../../../lib/picture-wire';
import { useOnScreen } from '../../hooks/use-movie';
import { usePicture } from '../../hooks/use-picture';
import { pixelSize, useBitmapCanvas } from '../../hooks/use-bitmap-canvas';
import styles from './MessagePicture.module.css';

/**
 * A picture from the chat, in the theme's ink and paper; blank until inflated,
 * and fetched only once it nears the screen.
 */
export function MessagePicture({ picture }: { picture: KeptPicture }) {
  const empty = useMemo(
    () => blank(picture.width, picture.height),
    [picture.width, picture.height]
  );
  const ref = useRef<HTMLCanvasElement>(null);
  const onScreen = useOnScreen(ref);
  const shown = usePicture(picture, onScreen.ever) ?? empty;
  useBitmapCanvas(shown, ref);

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
