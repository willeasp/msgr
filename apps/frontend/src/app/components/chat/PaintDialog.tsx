import { useRef, useState } from 'react';
import { getPixel, isBlank, type Bits } from '@msgr/bitmap';
import {
  PATTERNS,
  fill,
  newDrawing,
  paintStroke,
  swatch,
  type Brush,
  type Point,
} from '../../../lib/paint';
import type { Bitmap } from '../../../lib/pixels';
import Button from '../../../sacred/components/Button';
import { useModals } from '../../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../../sacred/modules/hotkeys';
import { useBitmapCanvas } from '../../hooks/use-bitmap-canvas';
import { BRUSH, BUCKET, ERASER, PENCIL } from '../icons';
import { DialogButtons, MacDialog } from '../MacDialog';
import { PixelIcon } from '../PixelIcon';
import { pixelSize } from './MessagePicture';
import styles from './PaintDialog.module.css';

type Tool = Brush | 'bucket';

const TOOLS = [
  { tool: 'pencil', label: 'Pencil', icon: PENCIL },
  { tool: 'brush', label: 'Brush', icon: BRUSH },
  { tool: 'bucket', label: 'Paint Bucket', icon: BUCKET },
  { tool: 'eraser', label: 'Eraser', icon: ERASER },
] as const satisfies readonly { tool: Tool; label: string; icon: Bitmap }[];

const UNDO_STEPS = 20;

interface PaintDialogProps {
  /** The chat's title, for the window's own. */
  chatTitle: string;
  /** A picture to start from, at its own size; left as it is. */
  start?: Bits;
  /** Takes the finished picture, to attach to the message being written. */
  onAttach: (bits: Bits) => void;
}

/** MacPaint, more or less: draws a picture to attach to a message. */
export function PaintDialog({ chatTitle, start, onAttach }: PaintDialogProps) {
  const { close } = useModals();
  const [bits] = useState<Bits>(() =>
    start ? { ...start, bytes: start.bytes.slice() } : newDrawing()
  );
  const { ref, repaint } = useBitmapCanvas(bits);
  const [tool, setTool] = useState<Tool>('pencil');
  const [pattern, setPattern] = useState<(typeof PATTERNS)[number]>(
    PATTERNS[0]
  );
  const [changed, setChanged] = useState(false);
  const [empty, setEmpty] = useState(() => isBlank(bits));
  const [confirming, setConfirming] = useState(false);
  // Copies of the bitmap from before each stroke, fill or clear.
  const history = useRef<Uint8Array[]>([]);
  // The pointer drawing the current stroke; other fingers are ignored.
  const stroke = useRef<{
    pointerId: number;
    last: Point;
    ink: boolean;
  } | null>(null);

  const drew = () => {
    repaint();
    setChanged(true);
    setEmpty(isBlank(bits));
  };
  const checkpoint = () => {
    history.current = [
      ...history.current.slice(1 - UNDO_STEPS),
      bits.bytes.slice(),
    ];
  };
  const undo = () => {
    const before = history.current.pop();
    if (!before) return;
    bits.bytes.set(before);
    drew();
  };
  const clear = () => {
    checkpoint();
    bits.bytes.fill(0);
    drew();
  };
  const cancel = () => (changed ? setConfirming(true) : close());
  const attach = () => {
    onAttach(bits);
    close();
  };

  useHotkeys('Escape', () => (confirming ? setConfirming(false) : cancel()), {
    enableOnFormTags: true,
  });
  useHotkeys('meta+z, ctrl+z', undo, { preventDefault: true });

  const at = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - box.left) / box.width) * bits.width),
      y: Math.floor(((e.clientY - box.top) / box.height) * bits.height),
    };
  };
  const options = (ink: boolean) => ({ ink, pattern: pattern.rows });

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || !e.isPrimary) return;
    // Keep drawing at the edge when the pointer leaves the canvas.
    e.currentTarget.setPointerCapture(e.pointerId);
    const point = at(e);
    checkpoint();
    if (tool === 'bucket') {
      fill(bits, point.x, point.y, pattern.rows);
    } else {
      // As in MacPaint, a pencil stroke that starts on ink draws paper.
      const ink = tool === 'pencil' ? !getPixel(bits, point.x, point.y) : true;
      paintStroke(bits, tool, point, point, options(ink));
      stroke.current = { pointerId: e.pointerId, last: point, ink };
    }
    drew();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const current = stroke.current;
    if (!current || current.pointerId !== e.pointerId || tool === 'bucket') {
      return;
    }
    const point = at(e);
    paintStroke(bits, tool, current.last, point, options(current.ink));
    current.last = point;
    drew();
  };
  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (stroke.current?.pointerId === e.pointerId) stroke.current = null;
  };

  return (
    <MacDialog title={`Drawing for ${chatTitle}`} modal wide>
      <div className={styles.workspace}>
        <div className={styles.tools}>
          {TOOLS.map(({ tool: name, label, icon }) => (
            <button
              key={name}
              type="button"
              className={styles.tool}
              aria-pressed={tool === name}
              onClick={() => setTool(name)}
              // In the window, so its keys (⌘Z, Escape) aren't the message box's.
              autoFocus={name === 'pencil'}
            >
              <PixelIcon bitmap={icon} label={label} />
            </button>
          ))}
          <button type="button" className={styles.action} onClick={undo}>
            Undo
          </button>
          <button type="button" className={styles.action} onClick={clear}>
            Clear
          </button>
        </div>
        <canvas
          ref={ref}
          width={bits.width}
          height={bits.height}
          className={styles.canvas}
          style={pixelSize(bits)}
          role="img"
          aria-label="Canvas"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endStroke}
          onPointerCancel={endStroke}
        />
      </div>
      <div className={styles.patterns}>
        {PATTERNS.map((choice) => (
          <button
            key={choice.name}
            type="button"
            className={styles.pattern}
            aria-pressed={pattern.name === choice.name}
            aria-label={choice.name}
            title={choice.name}
            onClick={() => setPattern(choice)}
          >
            <PixelIcon bitmap={swatch(choice.rows, 16, 12)} />
          </button>
        ))}
      </div>
      {confirming ? (
        <>
          <p role="alert" className={styles.question}>
            Discard this drawing?
          </p>
          <DialogButtons>
            <Button
              theme="SECONDARY"
              onClick={() => setConfirming(false)}
              // Cancel, which had focus, is gone; keeping is the safe answer.
              autoFocus
            >
              Keep Drawing
            </Button>
            <Button onClick={() => close()}>Discard</Button>
          </DialogButtons>
        </>
      ) : (
        <DialogButtons>
          <Button theme="SECONDARY" onClick={cancel}>
            Cancel
          </Button>
          {empty ? (
            <Button isDisabled>Attach</Button>
          ) : (
            <Button onClick={attach}>Attach</Button>
          )}
        </DialogButtons>
      )}
    </MacDialog>
  );
}
