import { fitWithin, MOVIE_FPS, type Frames } from '@msgr/media';
import { makeMovie } from '../../lib/movie-making';
import { firstPart, type Part } from '../../lib/trim';

/** A movie's size for this video: shrunk to fit 320 on its long side. */
export const movieSize = (video: HTMLVideoElement) =>
  fitWithin(video.videoWidth, video.videoHeight);

/** Resolves once `video` shows the frame at `time`, or after a while regardless. */
export function seek(video: HTMLVideoElement, time: number, wait = 4000) {
  return new Promise<void>((resolve) => {
    const done = () => {
      clearTimeout(timer);
      video.removeEventListener('seeked', done);
      resolve();
    };
    const timer = setTimeout(done, wait);
    video.addEventListener('seeked', done);
    video.currentTime = time;
  });
}

/**
 * The part's frames, MOVIE_FPS a second, as grey bytes `size` large, read
 * from the playing video. Playing beats seeking frame by frame, which phones
 * do slowly; browsers without `requestVideoFrameCallback` seek. Only these
 * small frames are kept: the file is streamed, never read into memory.
 */
export async function captureGrey(
  video: HTMLVideoElement,
  part: Part,
  { width, height }: { width: number; height: number },
  {
    onFrame,
    signal,
  }: { onFrame: (done: number, of: number) => void; signal: AbortSignal }
): Promise<Uint8Array> {
  const count = Math.max(1, Math.floor((part.end - part.start) * MOVIE_FPS));
  const grey = new Uint8Array(width * height * count);
  // Drawn at 2× and averaged 2×2: a clean shrink, whatever the browser's smoothing.
  const canvas = document.createElement('canvas');
  canvas.width = width * 2;
  canvas.height = height * 2;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('This browser can’t read the video’s frames.');
  context.imageSmoothingQuality = 'high';
  const grab = (frame: number) => {
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const rgba = context.getImageData(0, 0, canvas.width, canvas.height).data;
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        let sum = 0;
        for (let dy = 0; dy < 2; dy++) {
          for (let dx = 0; dx < 2; dx++) {
            const i = ((2 * y + dy) * canvas.width + 2 * x + dx) * 4;
            sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
          }
        }
        grey[(frame * height + y) * width + x] = Math.round(sum / 4);
      }
    }
  };

  // The frame for each 1/MOVIE_FPS of the video's own time, taken while it
  // plays when it shows that time; any it skipped over, or all of them
  // where a browser never says which frame it shows, sought one by one after.
  const at = (frame: number) => part.start + frame / MOVIE_FPS;
  const missing: number[] = [];
  let next = 0;
  await seek(video, part.start);
  if ('requestVideoFrameCallback' in HTMLVideoElement.prototype) {
    await new Promise<void>((resolve) => {
      let quiet = 0;
      let finished = false;
      let pending = 0;
      const finish = () => {
        if (finished) return;
        finished = true;
        // Seeking comes next; a callback left waiting would grab frames too.
        video.cancelVideoFrameCallback(pending);
        clearInterval(watch);
        video.removeEventListener('ended', finish);
        video.pause();
        video.playbackRate = 1;
        resolve();
      };
      const onVideoFrame = (
        _: number,
        { mediaTime }: { mediaTime: number }
      ) => {
        quiet = 0;
        while (next < count && mediaTime >= at(next) - 0.02) {
          if (mediaTime < at(next + 1)) grab(next);
          else missing.push(next);
          next++;
        }
        onFrame(next - missing.length, count);
        if (signal.aborted || next >= count || mediaTime >= part.end) finish();
        else pending = video.requestVideoFrameCallback(onVideoFrame);
      };
      // No frame for a second and a half: stop playing and seek the rest.
      const watch = setInterval(() => {
        if (++quiet > 3) finish();
      }, 500);
      video.addEventListener('ended', finish);
      pending = video.requestVideoFrameCallback(onVideoFrame);
      video.playbackRate = 2;
      video.play().catch(finish);
    });
  }
  const rest = Array.from({ length: count - next }, (_, i) => next + i);
  let done = next - missing.length;
  for (const frame of [...missing, ...rest]) {
    if (signal.aborted) break;
    await seek(video, at(frame));
    grab(frame);
    onFrame(++done, count);
  }
  return grey;
}

/**
 * Thumbnails along a whole video, side by side, `width`×`height` in all and
 * each `cell` wide, as lightness from 0 to 1, read from a second, muted
 * copy of it. Null if the video won't load within 8 s, or once `signal` is
 * stopped; the copy is let go either way.
 */
export async function thumbnailStrip(
  url: string,
  duration: number,
  { width, height, cell }: { width: number; height: number; cell: number },
  signal: { readonly stopped: boolean }
): Promise<number[] | null> {
  const thumbs = document.createElement('video');
  Object.assign(thumbs, {
    muted: true,
    playsInline: true,
    preload: 'auto',
    src: url,
  });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  try {
    await new Promise((loaded, failed) => {
      thumbs.onloadeddata = loaded;
      thumbs.onerror = failed;
      // A video that never loads still lets the copy go.
      setTimeout(failed, 8000);
    });
    await thumbs.play().catch(() => undefined);
    thumbs.pause();
    const cells = Math.ceil(width / cell);
    for (let i = 0; i < cells && !signal.stopped && context; i++) {
      await seek(
        thumbs,
        Math.min(duration - 0.05, ((i + 0.5) / cells) * duration),
        3000
      );
      context.drawImage(thumbs, i * cell, 0, cell, height);
    }
    if (signal.stopped || !context) return null;
    const rgba = context.getImageData(0, 0, width, height).data;
    return Array.from(
      { length: width * height },
      (_, i) =>
        (0.299 * rgba[i * 4] +
          0.587 * rgba[i * 4 + 1] +
          0.114 * rgba[i * 4 + 2]) /
        255
    );
  } catch {
    // The timeline works without its pictures.
    return null;
  } finally {
    thumbs.removeAttribute('src');
    thumbs.load();
  }
}

/** How far making a movie has got. */
export interface Making {
  readonly stage: 'Fetching' | 'Reading' | 'Dithering';
  readonly done: number;
  readonly of: number;
}

/**
 * Reads the part of the video and dithers it into a movie, a frame at a
 * time; null if stopped first.
 */
export async function movieFrom(
  video: HTMLVideoElement,
  part: Part,
  signal: AbortSignal,
  progress: (making: Making) => void
): Promise<Frames | null> {
  const size = movieSize(video);
  // iOS draws nothing from a video that has never played; a play() inside
  // the click fixes that.
  await video.play().catch(() => undefined);
  video.pause();
  progress({ stage: 'Reading', done: 0, of: 0 });
  const grey = await captureGrey(video, part, size, {
    signal,
    onFrame: (done, of) => progress({ stage: 'Reading', done, of }),
  });
  const count = grey.length / (size.width * size.height);
  const steps = makeMovie(grey, size.width, size.height, count);
  for (;;) {
    if (signal.aborted) return null;
    const step = steps.next();
    if (step.done) return step.value;
    progress({ stage: 'Dithering', done: step.value, of: count });
    // Lets the page paint between frames.
    await new Promise((resolve) => setTimeout(resolve));
  }
}

/** Why a movie couldn't be made of a video at an address: it couldn't be fetched, or played. */
export class Unmade extends Error {}

/**
 * A movie of the video at `url` (one of this server's), from its start for
 * as long as a movie may be, read in `video`, which must be on the page:
 * browsers read the frames of a video they show. The video is fetched
 * whole first, so it plays from the device. Null if stopped first.
 */
export async function movieFromAddress(
  video: HTMLVideoElement,
  url: string,
  signal: AbortSignal,
  progress: (making: Making) => void
): Promise<Frames | null> {
  progress({ stage: 'Fetching', done: 0, of: 0 });
  const response = await fetch(url, { signal }).catch(() => null);
  const blob = response?.ok ? await response.blob().catch(() => null) : null;
  if (signal.aborted) return null;
  if (!blob) throw new Unmade('That GIF couldn’t be fetched. Try again.');
  const made = URL.createObjectURL(blob);
  try {
    video.src = made;
    const playable = await new Promise<boolean>((done) => {
      const finish = (ok: boolean) => {
        clearTimeout(timer);
        signal.removeEventListener('abort', stop);
        done(ok);
      };
      const stop = () => finish(false);
      // One that never loads, or is stopped first, lets go all the same.
      const timer = setTimeout(stop, 10_000);
      signal.addEventListener('abort', stop);
      video.onloadedmetadata = () =>
        finish(Number.isFinite(video.duration) && video.videoWidth > 0);
      video.onerror = stop;
    });
    if (signal.aborted) return null;
    if (!playable) throw new Unmade('This browser can’t play that GIF.');
    return await movieFrom(video, firstPart(video.duration), signal, progress);
  } finally {
    video.onloadedmetadata = null;
    video.onerror = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
    URL.revokeObjectURL(made);
  }
}
