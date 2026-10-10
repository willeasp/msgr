import { useMemo } from 'react';
import { HEIGHT, WIDTH, fromBase64 } from '../../../lib/paint';
import ActionButton from '../../../sacred/components/ActionButton';
import { useBitmapCanvas } from '../../hooks/use-bitmap-canvas';
import styles from './DrawingPicture.module.css';

interface DrawingPictureProps {
  /** The message's drawing, in base64. */
  drawing: string;
  /** Opens the paint window with this drawing as the canvas. */
  onDrawOnIt?: () => void;
}

/** A drawing in a chat, in the theme's ink and paper. */
export function DrawingPicture({ drawing, onDrawOnIt }: DrawingPictureProps) {
  const bits = useMemo(() => fromBase64(drawing), [drawing]);
  const { ref } = useBitmapCanvas(bits);

  return (
    <>
      <canvas
        ref={ref}
        width={WIDTH}
        height={HEIGHT}
        role="img"
        aria-label="Drawing"
        className={styles.picture}
      />
      {onDrawOnIt && (
        <div className={styles.actions}>
          <ActionButton onClick={onDrawOnIt}>Draw on It</ActionButton>
        </div>
      )}
    </>
  );
}
