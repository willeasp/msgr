import { useRef, type RefObject } from 'react';
import type { Bits } from '@msgr/bitmap';
import { moveTo, setEnd, setStart, type Part } from '../../../lib/trim';
import { useBitmapCanvas } from '../../hooks/use-bitmap-canvas';
import styles from './Timeline.module.css';

interface TimelineProps {
  /** The track, for a caller that sizes what's drawn along it. */
  ref?: RefObject<HTMLDivElement | null>;
  /** How long the whole video or sound is, in seconds. */
  duration: number;
  /** The most that may be kept, in seconds. */
  longest: number;
  part: Part;
  /** A new part, and the time to show for it: where it starts or ends. */
  onChoose: (part: Part, at: number) => void;
  /** Drawn along the track: thumbnails, or the sound's shape. */
  strip: Bits;
  /** Where playing has reached, in seconds, while it plays. */
  playhead: number | null;
  /** Busy making something: nothing moves. */
  disabled: boolean;
}

const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const seconds = (s: number) => `${Math.round(s * 10) / 10} s`;

/**
 * Chooses part of something, the way a phone trims a video: a window over
 * the whole of it, dragged by its middle and sized by its handles, or moved
 * with the arrow keys (Shift for bigger steps).
 */
export function Timeline({
  ref,
  duration,
  longest,
  part,
  onChoose,
  strip,
  playhead,
  disabled,
}: TimelineProps) {
  const own = useRef<HTMLDivElement>(null);
  const track = ref ?? own;
  const drag = useRef<{
    mode: 'start' | 'end' | 'move';
    offset: number;
  } | null>(null);
  const { ref: stripRef } = useBitmapCanvas(strip);
  const length = part.end - part.start;

  const timeAt = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box) return 0;
    return (
      Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * duration
    );
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    const t = timeAt(e.clientX);
    const handle = (e.target as HTMLElement).dataset['handle'];
    if (handle === 'start' || handle === 'end') {
      drag.current = { mode: handle, offset: 0 };
    } else if (handle === 'window') {
      drag.current = { mode: 'move', offset: t - part.start };
    } else {
      // A tap beside the window centres it there.
      const moved = moveTo(part, t - length / 2, duration);
      onChoose(moved, moved.start);
      drag.current = { mode: 'move', offset: t - moved.start };
    }
    e.currentTarget.setPointerCapture(e.pointerId);
    e.preventDefault();
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d) return;
    const t = timeAt(e.clientX);
    if (d.mode === 'start') {
      const next = setStart(part, t, longest);
      onChoose(next, next.start);
    } else if (d.mode === 'end') {
      const next = setEnd(part, t, duration, longest);
      onChoose(next, next.end);
    } else {
      const next = moveTo(part, t - d.offset, duration);
      onChoose(next, next.start);
    }
  };
  const endDrag = () => {
    drag.current = null;
  };
  const keys =
    (apply: (step: number) => [Part, number]) => (e: React.KeyboardEvent) => {
      const step = e.shiftKey ? 5 : 0.5;
      const by = {
        ArrowLeft: -step,
        ArrowDown: -step,
        ArrowRight: step,
        ArrowUp: step,
      }[e.key];
      if (by === undefined || disabled) return;
      e.preventDefault();
      e.stopPropagation();
      onChoose(...apply(by));
    };

  const percent = (t: number) => `${(t / (duration || 1)) * 100}%`;

  return (
    <>
      <div
        ref={track}
        className={styles.timeline}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
      >
        <canvas
          ref={stripRef}
          width={strip.width}
          height={strip.height}
          className={styles.strip}
          aria-hidden
        />
        <div
          className={styles.shade}
          style={{ left: 0, width: percent(part.start) }}
        />
        <div
          className={styles.shade}
          style={{ left: percent(part.end), right: 0 }}
        />
        <div
          data-handle="window"
          className={styles.window}
          style={{ left: percent(part.start), width: percent(length) }}
          tabIndex={0}
          role="group"
          aria-label="The part to keep: drag it, or use the arrow keys"
          onKeyDown={keys((by) => {
            const next = moveTo(part, part.start + by, duration);
            return [next, next.start];
          })}
        >
          <div
            data-handle="start"
            className={`${styles.handle} ${styles.start}`}
            role="slider"
            tabIndex={0}
            aria-label="Start"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={part.start}
            aria-valuetext={clock(part.start)}
            onKeyDown={keys((by) => {
              const next = setStart(part, part.start + by, longest);
              return [next, next.start];
            })}
          />
          <div
            data-handle="end"
            className={`${styles.handle} ${styles.end}`}
            role="slider"
            tabIndex={0}
            aria-label="End"
            aria-valuemin={0}
            aria-valuemax={duration}
            aria-valuenow={part.end}
            aria-valuetext={clock(part.end)}
            onKeyDown={keys((by) => {
              const next = setEnd(part, part.end + by, duration, longest);
              return [next, next.end];
            })}
          />
        </div>
        {playhead !== null && (
          <div
            className={styles.playhead}
            style={{ left: percent(playhead) }}
          />
        )}
      </div>
      <p className={styles.times}>
        <span>{clock(part.start)}</span>
        <b>
          {seconds(length)} of at most {longest} s
        </b>
        <span>{clock(part.end)}</span>
      </p>
    </>
  );
}
