import { useMemo, type CSSProperties } from 'react';
import { blank, fromBase64, type Bits } from '@msgr/bitmap';
import { useBitmapCanvas } from '../../hooks/use-bitmap-canvas';
import styles from './MessagePicture.module.css';

/** A picture's size for CSS, which draws it at 2× (1× on a phone). */
export const pixelSize = ({ width, height }: Bits) =>
  ({ '--width': width, '--height': height } as CSSProperties);

/** A drawing in a chat, in the theme's ink and paper. */
export function MessagePicture({ drawing }: { drawing: string }) {
  const bits = useMemo(() => {
    const bits = blank(256, 160);
    const bytes = fromBase64(drawing);
    if (bytes?.length === bits.bytes.length) bits.bytes.set(bytes);
    return bits;
  }, [drawing]);
  const { ref } = useBitmapCanvas(bits);

  return (
    <canvas
      ref={ref}
      width={bits.width}
      height={bits.height}
      role="img"
      aria-label="Drawing"
      className={styles.picture}
      style={pixelSize(bits)}
    />
  );
}
