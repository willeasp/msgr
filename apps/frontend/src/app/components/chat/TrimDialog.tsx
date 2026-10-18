import { useEffect, useRef, useState } from 'react';
import { atkinson, blank, type Bits, type Frames } from '@msgr/bitmap';
import { makeMovie } from '../../../lib/movie';
import {
  firstPart,
  LONGEST,
  moveTo,
  setEnd,
  setStart,
  type Part,
} from '../../../lib/trim';
import Button from '../../../sacred/components/Button';
import { useModals } from '../../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../../sacred/modules/hotkeys';
import { useBitmapCanvas } from '../../hooks/use-bitmap-canvas';
import { DialogButtons, MacDialog } from '../MacDialog';
import { captureGrey, LONGEST_VIDEO, movieSize, seek } from './movie-from-file';
import styles from './TrimDialog.module.css';

interface TrimDialogProps {
  /** The window's: "Movie for Ada". */
  title: string;
  /** A video picked, pasted or dropped; streamed, never read whole. */
  file: File;
  /** Takes the finished movie. */
  onDone: (movie: Frames) => void;
}

const clock = (s: number) =>
  `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const seconds = (s: number) => `${Math.round(s * 10) / 10} s`;

/**
 * Chooses up to six seconds of a video, the way a phone trims one: a window
 * over the whole video, dragged by its middle and sized by its handles, and
 * makes them a movie on this device.
 */
export function TrimDialog({ title, file, onDone }: TrimDialogProps) {
  const { close } = useModals();
  const video = useRef<HTMLVideoElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [duration, setDuration] = useState(0);
  const [part, setPart] = useState<Part>({ start: 0, end: 0 });
  const [problem, setProblem] = useState<string | null>(null);
  const [making, setMaking] = useState<{
    stage: 'Reading' | 'Dithering';
    done: number;
    of: number;
  } | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [playhead, setPlayhead] = useState<number | null>(null);
  const [strip, setStrip] = useState<Bits>(() => blank(1, 1));
  const abort = useRef<AbortController | null>(null);
  const drag = useRef<{
    mode: 'start' | 'end' | 'move';
    offset: number;
  } | null>(null);
  const { ref: stripRef } = useBitmapCanvas(strip);

  useEffect(() => {
    // An object URL lets the browser stream the file from disk.
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file]);

  useEffect(() => () => abort.current?.abort(), []);

  const ready = duration > 0;
  const length = part.end - part.start;

  const onMetadata = () => {
    const v = video.current;
    if (!v) return;
    if (!Number.isFinite(v.duration) || !v.videoWidth) {
      setProblem('This browser can’t tell how long that video is.');
    } else if (v.duration > LONGEST_VIDEO) {
      setProblem(
        `That video is ${clock(
          v.duration
        )} long. Choose one of 10 minutes or less.`
      );
    } else {
      setDuration(v.duration);
      setPart(firstPart(v.duration));
    }
  };

  // Thumbnails along the timeline, dithered, from a second copy of the video.
  useEffect(() => {
    const v = video.current;
    const box = track.current;
    if (!ready || !url || !v || !box) return;
    let current = true;
    const height = 24;
    const width = Math.max(
      1,
      Math.round((box.clientWidth / box.clientHeight) * height)
    );
    const cell = Math.max(
      8,
      Math.round((height * v.videoWidth) / v.videoHeight)
    );
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
    void (async () => {
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
        for (let i = 0; i < cells && current && context; i++) {
          await seek(
            thumbs,
            Math.min(duration - 0.05, ((i + 0.5) / cells) * duration),
            3000
          );
          context.drawImage(thumbs, i * cell, 0, cell, height);
        }
        if (!current || !context) return;
        const rgba = context.getImageData(0, 0, width, height).data;
        const light = Array.from(
          { length: width * height },
          (_, i) =>
            (0.299 * rgba[i * 4] +
              0.587 * rgba[i * 4 + 1] +
              0.114 * rgba[i * 4 + 2]) /
            255
        );
        setStrip(atkinson(light, width, height));
      } catch {
        // The timeline works without its pictures.
      } finally {
        thumbs.removeAttribute('src');
        thumbs.load();
      }
    })();
    return () => {
      current = false;
    };
  }, [ready, url, duration]);

  // The chosen part, looping, while previewing.
  useEffect(() => {
    const v = video.current;
    if (!v || !previewing) return;
    const onTime = () => {
      if (v.currentTime >= part.end || v.currentTime < part.start - 0.5) {
        v.currentTime = part.start;
      }
      setPlayhead(v.currentTime);
    };
    v.currentTime = part.start;
    v.addEventListener('timeupdate', onTime);
    void v.play().catch(() => setPreviewing(false));
    return () => {
      v.removeEventListener('timeupdate', onTime);
      v.pause();
      setPlayhead(null);
    };
  }, [previewing, part.start, part.end]);

  const show = (time: number) => {
    const v = video.current;
    if (v && !previewing && !making) v.currentTime = time;
  };
  const choose = (next: Part, at: number) => {
    setPart(next);
    show(at);
  };

  const timeAt = (clientX: number) => {
    const box = track.current?.getBoundingClientRect();
    if (!box) return 0;
    return (
      Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * duration
    );
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!ready || making) return;
    const t = timeAt(e.clientX);
    const handle = (e.target as HTMLElement).dataset['handle'];
    if (handle === 'start' || handle === 'end') {
      drag.current = { mode: handle, offset: 0 };
    } else if (handle === 'window') {
      drag.current = { mode: 'move', offset: t - part.start };
    } else {
      // A tap beside the window centres it there.
      const moved = moveTo(part, t - length / 2, duration);
      choose(moved, moved.start);
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
      const next = setStart(part, t);
      choose(next, next.start);
    } else if (d.mode === 'end') {
      const next = setEnd(part, t, duration);
      choose(next, next.end);
    } else {
      const next = moveTo(part, t - d.offset, duration);
      choose(next, next.start);
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
      if (by === undefined || making) return;
      e.preventDefault();
      e.stopPropagation();
      choose(...apply(by));
    };

  const make = async () => {
    const v = video.current;
    if (!v || making) return;
    setPreviewing(false);
    setProblem(null);
    const controller = new AbortController();
    abort.current = controller;
    const size = movieSize(v);
    try {
      // iOS draws nothing from a video that has never played; a play() inside
      // the click fixes that.
      await v.play().catch(() => undefined);
      v.pause();
      setMaking({ stage: 'Reading', done: 0, of: 0 });
      const grey = await captureGrey(v, part, size, {
        signal: controller.signal,
        onFrame: (done, of) => setMaking({ stage: 'Reading', done, of }),
      });
      const count = grey.length / (size.width * size.height);
      const steps = makeMovie(grey, size.width, size.height, count);
      for (;;) {
        if (controller.signal.aborted) return;
        const step = steps.next();
        if (step.done) {
          onDone(step.value);
          close();
          return;
        }
        setMaking({ stage: 'Dithering', done: step.value, of: count });
        // Lets the page paint between frames.
        await new Promise((resolve) => setTimeout(resolve));
      }
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : 'That video couldn’t be read.'
      );
    } finally {
      if (abort.current === controller) abort.current = null;
      setMaking(null);
      v.playbackRate = 1;
    }
  };
  const stop = () => abort.current?.abort();

  useHotkeys('Escape', () => (making ? stop() : close()), {
    enableOnFormTags: true,
  });

  const percent = (t: number) => `${(t / (duration || 1)) * 100}%`;

  return (
    <MacDialog title={title} modal wide>
      <div className={styles.preview}>
        <video
          ref={video}
          src={url ?? undefined}
          muted
          playsInline
          preload="auto"
          className={styles.video}
          aria-label="The video"
          onLoadedMetadata={onMetadata}
          onError={() =>
            setProblem(
              'This browser can’t play that video. Try another, or Safari for an iPhone’s.'
            )
          }
        />
        {making && (
          <p className={styles.busy} aria-live="polite">
            <span>
              {making.of
                ? `${making.stage} frame ${making.done} of ${making.of}…`
                : 'Reading…'}
            </span>
          </p>
        )}
      </div>
      {ready && (
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
                  const next = setStart(part, part.start + by);
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
                  const next = setEnd(part, part.end + by, duration);
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
              {seconds(length)} of at most {LONGEST} s
            </b>
            <span>{clock(part.end)}</span>
          </p>
        </>
      )}
      {problem && (
        <p role="alert" className={styles.problem}>
          {problem}
        </p>
      )}
      <DialogButtons>
        {making ? (
          <>
            <Button theme="SECONDARY" onClick={stop}>
              Stop
            </Button>
            <Button isDisabled>Making…</Button>
          </>
        ) : (
          <>
            <Button theme="SECONDARY" onClick={() => close()}>
              Cancel
            </Button>
            {ready && (
              <Button
                theme="SECONDARY"
                onClick={() => setPreviewing((p) => !p)}
              >
                {previewing ? 'Stop' : 'Play'}
              </Button>
            )}
            {ready ? (
              <Button onClick={() => void make()}>Make Movie</Button>
            ) : (
              <Button isDisabled>Make Movie</Button>
            )}
          </>
        )}
      </DialogButtons>
    </MacDialog>
  );
}
