import { useRef, useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { withMessage } from '../../../lib/chat-list';
import { gql } from '../../../lib/__generated__';
import {
  HEIGHT,
  PATTERNS,
  WIDTH,
  blank,
  fill,
  fromBase64,
  getPixel,
  isBlank,
  paintStroke,
  swatch,
  toBase64,
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
import { GET_CHAT_MESSAGES } from './MessageList';
import styles from './PaintDialog.module.css';

const SEND_DRAWING = gql(`
  mutation SendDrawing($chatId: ID!, $drawing: String!) {
    sendDrawing(input: { chatId: $chatId, drawing: $drawing }) {
      id
      content
      drawing
      sender {
        id
        name
      }
      createdAt
    }
  }
`);

type Tool = Brush | 'bucket';

const TOOLS = [
  { tool: 'pencil', label: 'Pencil', icon: PENCIL },
  { tool: 'brush', label: 'Brush', icon: BRUSH },
  { tool: 'bucket', label: 'Paint Bucket', icon: BUCKET },
  { tool: 'eraser', label: 'Eraser', icon: ERASER },
] as const satisfies readonly { tool: Tool; label: string; icon: Bitmap }[];

const UNDO_STEPS = 20;

interface PaintDialogProps {
  chatId: string;
  /** The chat's title, for the window's own. */
  chatTitle: string;
  /** A drawing to start from, for Draw on It. */
  start?: string;
}

/** MacPaint, more or less: draws a picture and sends it to the chat. */
export function PaintDialog({ chatId, chatTitle, start }: PaintDialogProps) {
  const { close } = useModals();
  const [bits] = useState(() => (start ? fromBase64(start) : blank()));
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
  const stroke = useRef<{ last: Point; ink: boolean } | null>(null);

  const [sendDrawing, { loading: sending, error }] = useMutation(SEND_DRAWING, {
    onCompleted: () => close(),
    update: (cache, { data }) => {
      if (!data?.sendDrawing) return;
      cache.updateQuery(
        { query: GET_CHAT_MESSAGES, variables: { chatId } },
        (existing) =>
          existing && {
            // The feed may have delivered it already.
            messages: [...withMessage(existing.messages, data.sendDrawing)],
          }
      );
    },
  });

  const drew = () => {
    repaint();
    setChanged(true);
    setEmpty(isBlank(bits));
  };
  const checkpoint = () => {
    history.current = [...history.current.slice(1 - UNDO_STEPS), bits.slice()];
  };
  const undo = () => {
    const before = history.current.pop();
    if (!before) return;
    bits.set(before);
    drew();
  };
  const clear = () => {
    checkpoint();
    bits.fill(0);
    drew();
  };
  const cancel = () => (changed ? setConfirming(true) : close());
  const send = () => {
    // A failure shows from `error`, and the drawing stays.
    sendDrawing({ variables: { chatId, drawing: toBase64(bits) } }).catch(
      () => undefined
    );
  };

  useHotkeys('Escape', () => (confirming ? setConfirming(false) : cancel()), {
    enableOnFormTags: true,
  });
  useHotkeys('meta+z, ctrl+z', undo, { preventDefault: true });

  const at = (e: React.PointerEvent<HTMLCanvasElement>): Point => {
    const box = e.currentTarget.getBoundingClientRect();
    return {
      x: Math.floor(((e.clientX - box.left) / box.width) * WIDTH),
      y: Math.floor(((e.clientY - box.top) / box.height) * HEIGHT),
    };
  };
  const options = (ink: boolean) => ({ ink, pattern: pattern.rows });

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button !== 0) return;
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
      stroke.current = { last: point, ink };
    }
    drew();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const current = stroke.current;
    if (!current || tool === 'bucket') return;
    const point = at(e);
    paintStroke(bits, tool, current.last, point, options(current.ink));
    current.last = point;
    drew();
  };
  const endStroke = () => {
    stroke.current = null;
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
          width={WIDTH}
          height={HEIGHT}
          className={styles.canvas}
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
      {error && (
        <p role="alert" className={styles.error}>
          {error.message}
        </p>
      )}
      {confirming ? (
        <>
          <p className={styles.question}>Discard this drawing?</p>
          <DialogButtons>
            <Button theme="SECONDARY" onClick={() => setConfirming(false)}>
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
          {sending ? (
            <Button isDisabled>Sending</Button>
          ) : empty ? (
            <Button isDisabled>Send</Button>
          ) : (
            <Button onClick={send}>Send</Button>
          )}
        </DialogButtons>
      )}
    </MacDialog>
  );
}
