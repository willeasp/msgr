// @vitest-environment jsdom
import { act, createElement, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { blank, MOVIE_FPS, type Bits } from '@msgr/media';
import { useMovieSteps } from './use-movie';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let painted: number;
let reducedMotion: boolean;
beforeEach(() => {
  vi.useFakeTimers();
  painted = 0;
  reducedMotion = false;
  // jsdom draws nothing; count what would be.
  HTMLCanvasElement.prototype.getContext = function () {
    return {
      createImageData: (width: number, height: number) => ({
        width,
        height,
        data: new Uint8ClampedArray(width * height * 4),
      }),
      putImageData: () => {
        painted += 1;
      },
      // The pen that reads colours (app/browser/theme.ts).
      clearRect: () => undefined,
      fillRect: () => undefined,
      getImageData: () => ({ data: [0, 0, 0, 255] }),
    };
  } as unknown as HTMLCanvasElement['getContext'];
  window.matchMedia = ((query: string) => ({
    matches: query.includes('reduce') && reducedMotion,
  })) as unknown as typeof window.matchMedia;
});
afterEach(() => vi.useRealTimers());

const frames = [blank(8, 1), blank(8, 1)];

function mount(active: boolean) {
  const seen: number[] = [];
  let renders = 0;
  const Movie = () => {
    renders += 1;
    const ref = useRef<HTMLCanvasElement>(null);
    useMovieSteps(
      ref,
      (tick): Bits => {
        seen.push(tick);
        return frames[tick % frames.length] ?? blank(8, 1);
      },
      active
    );
    return createElement('canvas', { ref, width: 8, height: 1 });
  };
  const root = createRoot(document.createElement('div'));
  act(() => root.render(createElement(Movie)));
  return {
    seen,
    renders: () => renders,
    unmount: () => act(() => root.unmount()),
  };
}

describe('useMovieSteps', () => {
  it('paints every tick, on the shared timer, re-rendering nothing', () => {
    const movie = mount(true);
    const first = painted;
    expect(first).toBe(1);

    act(() => vi.advanceTimersByTime(1000));
    expect(painted - first).toBe(MOVIE_FPS);
    expect(new Set(movie.seen).size).toBeGreaterThanOrEqual(MOVIE_FPS);
    expect(movie.renders()).toBe(1);
    movie.unmount();
  });

  it('stands still while inactive, for less motion, and while the page is hidden', () => {
    const still = mount(false);
    act(() => vi.advanceTimersByTime(1000));
    expect(painted).toBe(1);
    still.unmount();

    painted = 0;
    reducedMotion = true;
    const calm = mount(true);
    act(() => vi.advanceTimersByTime(1000));
    expect(painted).toBe(1);
    calm.unmount();

    painted = 0;
    reducedMotion = false;
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => true,
    });
    const hidden = mount(true);
    act(() => vi.advanceTimersByTime(1000));
    expect(painted).toBe(1);
    hidden.unmount();
    Object.defineProperty(document, 'hidden', {
      configurable: true,
      get: () => false,
    });
  });

  it('stops the timer once nothing steps', () => {
    const movie = mount(true);
    movie.unmount();
    const before = painted;
    act(() => vi.advanceTimersByTime(1000));
    expect(painted).toBe(before);
    expect(vi.getTimerCount()).toBe(0);
  });
});
