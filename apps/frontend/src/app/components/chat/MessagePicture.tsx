import { useMemo } from 'react';
import { HEIGHT, WIDTH, fromBase64 } from '../../../lib/paint';
import { useBitmapCanvas } from '../../hooks/use-bitmap-canvas';
import styles from './DrawingPicture.module.css';

/** A drawing in a chat, in the theme's ink and paper. */
export function DrawingPicture({ drawing }: { drawing: string }) {
  const bits = useMemo(() => fromBase64(drawing), [drawing]);
  const { ref } = useBitmapCanvas(bits);

  return (
    <canvas
      ref={ref}
      width={WIDTH}
      height={HEIGHT}
      role="img"
      aria-label="Drawing"
      className={styles.picture}
    />
  );
}
