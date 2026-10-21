import { useEffect, useRef, useState } from 'react';
import { atkinson, blank, type Bits, type Frames } from '@msgr/media';
import { makeMovie } from '../../../lib/movie';
import { firstPart, LONGEST, type Part } from '../../../lib/trim';
import Button from '../../../sacred/components/Button';
import { useModals } from '../../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../../sacred/modules/hotkeys';
import { DialogButtons, MacDialog } from '../MacDialog';
import { LONGEST_VIDEO } from '../../../lib/files';
import {
  captureGrey,
  movieSize,
  thumbnailStrip,
} from '../../browser/video-file';
import { Timeline } from './Timeline';
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

  useEffect(() => {
    // An object URL lets the browser stream the file from disk.
    const made = URL.createObjectURL(file);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [file]);

  useEffect(() => () => abort.current?.abort(), []);

  const ready = duration > 0;

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
    const height = 24;
    const width = Math.max(
      1,
      Math.round((box.clientWidth / box.clientHeight) * height)
    );
    const cell = Math.max(
      8,
      Math.round((height * v.videoWidth) / v.videoHeight)
    );
    const signal = { stopped: false };
    void thumbnailStrip(url, duration, { width, height, cell }, signal).then(
      (light) => {
        if (light && !signal.stopped) setStrip(atkinson(light, width, height));
      }
    );
    return () => {
      signal.stopped = true;
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
        <Timeline
          ref={track}
          duration={duration}
          longest={LONGEST}
          part={part}
          onChoose={choose}
          strip={strip}
          playhead={playhead}
          disabled={!!making}
        />
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
