import {
  useEffect,
  useState,
  useSyncExternalStore,
  type RefObject,
} from 'react';
import { MOVIE_FPS, type Bits } from '@msgr/media';
import type { KeptMovie } from '../../lib/movie-wire';
import { THEME_CHANGED } from '../browser/theme';
import { movies } from '../data/media';
import { paintBits } from './use-bitmap-canvas';
import { useMedia } from './use-media';

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
const currentTick = () => tick;

/**
 * The movies' shared frame count: frame `tick % count` of each is showing.
 * Inactive (a movie scrolled out of sight, a picture in the paint window),
 * it neither re-renders nor keeps the timer going.
 */
export const useMovieTick = (active = true) =>
  useSyncExternalStore(active ? subscribe : unsubscribed, () => tick);

/**
 * Paints `frameAt(tick)` on the canvas: at once, on every tick while
 * `active`, and whenever the theme changes. It re-renders nothing: a movie
 * steps by painting, on the page's one timer, with every other movie.
 */
export function useMovieSteps(
  ref: RefObject<HTMLCanvasElement | null>,
  frameAt: (tick: number) => Bits,
  active: boolean
): () => void {
  useEffect(() => {
    const paint = () => {
      if (ref.current) paintBits(ref.current, frameAt(currentTick()));
    };
    paint();
    window.addEventListener(THEME_CHANGED, paint);
    const stop = active ? subscribe(paint) : undefined;
    return () => {
      window.removeEventListener(THEME_CHANGED, paint);
      stop?.();
    };
  }, [ref, frameAt, active]);
  // Paints this tick's frame now: after drawing on it, say.
  return () => {
    if (ref.current) paintBits(ref.current, frameAt(currentTick()));
  };
}

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

/**
 * A movie's frames once fetched and decoded; null until then, or for a broken
 * one. One already here shows at once; any other is fetched once `near`.
 */
export const useMovie = (movie: KeptMovie | null | undefined, near = true) =>
  useMedia(movies, movie, near);
