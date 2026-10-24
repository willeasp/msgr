import { useEffect, useRef, useState } from 'react';
import {
  HELD_AFTER_MS,
  IDLE,
  PRESSED_AFTER_MS,
  pressAfter,
  showsPressed,
  type Press,
  type PressEvent,
} from '../../lib/press';

interface LongPress {
  /** A click with a mouse or a pen. */
  onClick: (event: React.MouseEvent<HTMLElement>) => void;
  /** A finger held still on it (lib/press.ts). */
  onHold: () => void;
}

/**
 * Get Info's gesture: a click with a mouse or a pen, a long press with a
 * finger, so a finger scrolling past never opens anything and a tap does
 * nothing. Spread `handlers` on what's pressed; `pressed` says to show it
 * inverted.
 */
export function useLongPress({ onClick, onHold }: LongPress) {
  const press = useRef<Press>(IDLE);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // Whether the last pointer down was a finger's.
  const byFinger = useRef(false);
  const [pressed, setPressed] = useState(false);
  useEffect(() => {
    const pending = timers;
    return () => pending.current.forEach(clearTimeout);
  }, []);

  const step = (event: PressEvent) => {
    const before = press.current;
    const after = pressAfter(before, event);
    press.current = after;
    setPressed(showsPressed(after));
    if (after.phase === 'idle' || after.phase === 'held') {
      timers.current.forEach(clearTimeout);
      timers.current = [];
    }
    if (after.phase === 'held' && before.phase !== 'held') onHold();
  };
  const lift = () => {
    if (press.current.phase !== 'idle') step({ type: 'up' });
  };

  const handlers = {
    onPointerDown: (event: React.PointerEvent<HTMLElement>) => {
      byFinger.current = event.pointerType === 'touch';
      if (!byFinger.current || !event.isPrimary) return;
      // A link opens itself, and a sound's controls play it.
      if ((event.target as Element).closest('a, button, [data-own-clicks]')) {
        return;
      }
      timers.current.forEach(clearTimeout);
      const at = now();
      step({ type: 'down', x: event.clientX, y: event.clientY, at });
      // A timer can fire a hair before the clock says it's time; it's time.
      timers.current = [PRESSED_AFTER_MS, HELD_AFTER_MS].map((ms) =>
        setTimeout(
          () => step({ type: 'tick', at: Math.max(now(), at + ms) }),
          ms
        )
      );
    },
    onPointerMove: (event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType === 'touch' && press.current.phase !== 'idle') {
        step({ type: 'move', x: event.clientX, y: event.clientY });
      }
    },
    onPointerUp: lift,
    onPointerCancel: lift,
    // A finger held there would otherwise open the browser's own menu, which
    // a link keeps: to open it elsewhere, or copy it.
    onContextMenu: (event: React.MouseEvent<HTMLElement>) => {
      if (!byFinger.current) return;
      if ((event.target as Element).closest('a')) return;
      event.preventDefault();
    },
    onClick: (event: React.MouseEvent<HTMLElement>) => {
      if (!byFinger.current) onClick(event);
    },
  };
  return { pressed, handlers };
}

const now = () => performance.now();
