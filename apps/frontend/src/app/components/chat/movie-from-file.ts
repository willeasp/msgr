import { fitWithin, MOVIE_FPS } from '@msgr/bitmap';
import type { Part } from '../../../lib/trim';
import { isAudio } from './sound-from-file';

/** The longest video a movie can be cut from, in seconds. */
export const LONGEST_VIDEO = 10 * 60;

export const isVideo = (file: Blob) => file.type.startsWith('video/');

/** The first picture, video or sound among dropped or pasted files, if any. */
export const firstMedia = (files: FileList | null | undefined) =>
  Array.from(files ?? []).find(
    (file) => file.type.startsWith('image/') || isVideo(file) || isAudio(file)
  ) ?? null;

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
