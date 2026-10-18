import { useCallback, useEffect, useRef, useState } from 'react';
import { blank, getPixel, isBlank, type Bits, type Frames } from '@msgr/bitmap';
import { frameShown, type Drawing } from '../../../lib/movie';
import {
  PATTERNS,
  coverStroke,
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
import { pixelSize, useBitmapCanvas } from '../../hooks/use-bitmap-canvas';
import { useMovieTick } from '../../hooks/use-movie';
import { BRUSH, BUCKET, ERASER, PENCIL } from '../icons';
import { DialogButtons, MacDialog } from '../MacDialog';
import { PixelIcon } from '../PixelIcon';
import styles from './PaintDialog.module.css';

type Tool = Brush | 'bucket';

const TOOLS = [
  { tool: 'pencil', label: 'Pencil', icon: PENCIL },
  { tool: 'brush', label: 'Brush', icon: BRUSH },
  { tool: 'bucket', label: 'Paint Bucket', icon: BUCKET },
  { tool: 'eraser', label: 'Eraser', icon: ERASER },
] as const satisfies readonly { tool: Tool; label: string; icon: Bitmap }[];

const UNDO_STEPS = 20;

type PaintDialogProps = {
  /** The window's: "Drawing for Ada". */
  title: string;
  /** The button that takes the finished drawing: "Attach". */
  done: string;
} & (
  | {
      /** A picture to start from, at its own size; left as it is. */
      start?: Bits;
      movie?: undefined;
      /** Takes the finished picture. */
      onDone: (bits: Bits) => void;
    }
  | {
      /** A movie to draw over, looping underneath; left as it is. */
      movie: Frames;
      /** What was drawn over it before, to carry on from. */
      drawing?: Drawing | null;
      /** Takes what's drawn, the same over every frame. */
      onDone: (drawing: Drawing) => void;
    }
);

const copy = (bits: Bits): Bits => ({ ...bits, bytes: bits.bytes.slice() });

/**
 * MacPaint, more or less: draws a picture, for a message or a profile; or
 * draws over a movie, which loops underneath, everything drawn staying over
 * every frame.
 */
export function PaintDialog(props: PaintDialogProps) {
  const { title, done, movie } = props;
  const { close } = useModals();
  // Over a movie, `bits` holds what's drawn and `mask` where.
  const [bits] = useState<Bits>(() =>
    movie
      ? props.drawing
        ? copy(props.drawing.ink)
        : blank(movie.width, movie.height)
      : props.start
      ? copy(props.start)
      : newDrawing()
  );
  const [mask] = useState<Bits | null>(() =>
    movie
      ? props.drawing
        ? copy(props.drawing.mask)
        : blank(movie.width, movie.height)
      : null
  );
  // What the canvas shows: the picture, or the drawing over this frame.
  const [shown] = useState<Bits>(() =>
    movie ? blank(movie.width, movie.height) : bits
  );
  const { ref, repaint } = useBitmapCanvas(shown);
  const tick = useMovieTick();
  // The frame showing now, with the drawing over it.
  const compose = useCallback(() => {
    if (movie && mask) {
      frameShown(movie, tick % movie.count, { ink: bits, mask }, shown);
    }
  }, [movie, mask, bits, shown, tick]);
  useEffect(() => {
    compose();
    repaint();
  }, [compose, repaint]);
  const [tool, setTool] = useState<Tool>('pencil');
  const [pattern, setPattern] = useState<(typeof PATTERNS)[number]>(
    PATTERNS[0]
  );
  const [changed, setChanged] = useState(false);
  // A movie is never empty, drawn on or not.
  const [empty, setEmpty] = useState(() => !movie && isBlank(bits));
  const [confirming, setConfirming] = useState(false);
  // Copies of the drawing (and where, over a movie) from before each stroke,
  // fill or clear.
  const history = useRef<[Uint8Array, Uint8Array | null][]>([]);
  // The pointer drawing the current stroke; other fingers are ignored.
  const stroke = useRef<{
    pointerId: number;
    last: Point;
    ink: boolean;
  } | null>(null);

  const drew = () => {
    compose();
    repaint();
    setChanged(true);
    setEmpty(!movie && isBlank(bits));
  };
  const checkpoint = () => {
    history.current = [
      ...history.current.slice(1 - UNDO_STEPS),
      [bits.bytes.slice(), mask?.bytes.slice() ?? null],
    ];
  };
  const undo = () => {
    const before = history.current.pop();
    if (!before) return;
    bits.bytes.set(before[0]);
    if (mask && before[1]) mask.bytes.set(before[1]);
    drew();
  };
  const clear = () => {
    checkpoint();
    bits.bytes.fill(0);
    mask?.bytes.fill(0);
    drew();
  };
  const cancel = () => (changed ? setConfirming(true) : close());
  const finish = () => {
    if (props.movie && mask) props.onDone({ ink: bits, mask });
    else if (!props.movie) props.onDone(bits);
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
  const paint = (from: Point, to: Point, ink: boolean) => {
    if (tool === 'bucket') return;
    paintStroke(bits, tool, from, to, options(ink));
    if (mask) coverStroke(mask, tool, from, to);
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0 || !e.isPrimary) return;
    // Keep drawing at the edge when the pointer leaves the canvas.
    e.currentTarget.setPointerCapture(e.pointerId);
    const point = at(e);
    checkpoint();
    if (tool === 'bucket') {
      fill(bits, point.x, point.y, pattern.rows);
    } else {
      // As in MacPaint, a pencil stroke that starts on ink draws paper:
      // over a movie, on ink as it shows right now.
      const ink = tool === 'pencil' ? !getPixel(shown, point.x, point.y) : true;
      paint(point, point, ink);
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
    paint(current.last, point, current.ink);
    current.last = point;
    drew();
  };
  const endStroke = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (stroke.current?.pointerId === e.pointerId) stroke.current = null;
  };

  return (
    <MacDialog title={title} modal wide>
      <div className={styles.workspace}>
        <div className={styles.tools}>
          {/* A fill follows the shapes of one frame, so a movie has none. */}
          {TOOLS.filter(({ tool: name }) => !movie || name !== 'bucket').map(
            ({ tool: name, label, icon }) => (
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
            )
          )}
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
          style={
            {
              ...pixelSize(bits),
              '--zoom': Math.min(
                3,
                Math.max(1, Math.floor(256 / Math.max(bits.width, bits.height)))
              ),
            } as React.CSSProperties
          }
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
            <Button isDisabled>{done}</Button>
          ) : (
            <Button onClick={finish}>{done}</Button>
          )}
        </DialogButtons>
      )}
    </MacDialog>
  );
}
