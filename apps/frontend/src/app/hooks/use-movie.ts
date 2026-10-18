import {
  useEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { MOVIE_FPS, type Frames } from '@msgr/bitmap';
import { movieFrames, type WireMovie } from '../../lib/movie-wire';

// One timer for every movie on the page, so they step together, and only
// while one is showing. Still for anyone who asked for less motion, and while
// the page is hidden.
let tick = 0;
let timer: ReturnType<typeof setInterval> | undefined;
const watchers = new Set<() => void>();
const still = () =>
  window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function subscribe(onTick: () => void) {
  watchers.add(onTick);
  timer ??= setInterval(() => {
    if (document.hidden || still()) return;
    tick++;
    for (const watcher of watchers) watcher();
  }, 1000 / MOVIE_FPS);
  return () => {
    watchers.delete(onTick);
    if (watchers.size === 0) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

const unsubscribed = () => () => undefined;

/**
 * The movies' shared frame count: frame `tick % count` of each is showing.
 * Inactive (a movie scrolled out of sight, a picture in the paint window),
 * it neither re-renders nor keeps the timer going.
 */
export const useMovieTick = (active = true) =>
  useSyncExternalStore(active ? subscribe : unsubscribed, () => tick);

/**
 * Whether the element is on screen or nearly, and whether it ever has been:
 * a movie decodes once first near the screen and steps only while there.
 */
export function useOnScreen(ref: RefObject<Element | null>) {
  const [state, setState] = useState({ now: false, ever: false });
  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        const now = entry?.isIntersecting ?? false;
        setState((was) => ({ now, ever: was.ever || now }));
      },
      { rootMargin: '200px' }
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return state;
}

/** A movie's frames once decoded; null until then, or for a broken one. */
export function useMovie(movie: WireMovie | null | undefined) {
  const [decoded, setDecoded] = useState<{
    movie: WireMovie;
    frames: Frames | null;
  } | null>(null);
  useEffect(() => {
    if (!movie) return;
    // After this paint: decoding a long movie takes a moment.
    const later = setTimeout(() =>
      setDecoded({ movie, frames: movieFrames(movie) })
    );
    return () => clearTimeout(later);
  }, [movie]);
  // Never the last movie's frames while the next one decodes.
  return movie && decoded?.movie === movie ? decoded.frames : null;
}
