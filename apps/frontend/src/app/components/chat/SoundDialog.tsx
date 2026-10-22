import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  isSilent,
  LONGEST_SOUND,
  SOUND_RATE,
  type SoundCodes,
} from '@msgr/media';
import { clock, samplePeaks, squash, waveform } from '../../../lib/sound';
import type { Recording } from '../../../lib/audio';
import { SOUND_FILES } from '../../../lib/files';
import { firstPart, type Part } from '../../../lib/trim';
import Button from '../../../sacred/components/Button';
import { useModals } from '../../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../../sacred/modules/hotkeys';
import { audio, canRecord } from '../../browser/audio';
import { useSoundPlayer } from '../../hooks/use-sound';
import { DialogButtons, DialogMessage, MacDialog } from '../MacDialog';
import { SPEAKER } from '../icons';
import { readSound } from '../../browser/sound-file';
import { Timeline } from './Timeline';
import styles from './SoundDialog.module.css';

interface SoundDialogProps {
  /** The window's: "Sound for Ada". */
  title: string;
  /** A file picked, pasted or dropped; without one, record or choose one. */
  file?: File;
  /** Takes the finished sound. */
  onDone: (codes: SoundCodes) => void;
}

/**
 * Where the dialog is. Asking for the microphone and recording hold their
 * recording, so the microphone goes back with whatever ends them, the dialog
 * closing included.
 */
type Stage =
  | { readonly kind: 'start' }
  | { readonly kind: 'asking'; readonly recording: Recording }
  | {
      readonly kind: 'recording';
      readonly recording: Recording;
      readonly since: number;
    }
  | { readonly kind: 'reading' }
  | { readonly kind: 'ready'; readonly samples: Float32Array };

/** Bars along the timeline: plenty for any width it's shown at. */
const BARS = 240;

/** Why recording failed, in words for the person. */
function recordingProblem(error: unknown): string {
  if (!canRecord()) {
    return 'This browser can’t record. Choose a file instead.';
  }
  if (error instanceof DOMException && error.name === 'NotAllowedError') {
    return 'Msgr can’t hear you: allow the microphone for this site, then try again.';
  }
  if (error instanceof DOMException && error.name === 'NotFoundError') {
    return 'There’s no microphone to record with. Choose a file instead.';
  }
  // Its name says what went wrong, for anyone reporting it.
  const name = error instanceof Error && error.name ? ` (${error.name})` : '';
  return `That recording didn’t work${name}. Try again, or choose a file.`;
}

/**
 * Makes a sound: recorded here, or from a file. Up to a minute of it is
 * chosen on its timeline, as a movie's part is; Play plays it squashed,
 * exactly as it will be sent, and Make Sound attaches it.
 */
export function SoundDialog({ title, file, onDone }: SoundDialogProps) {
  const { close } = useModals();
  const [stage, setStage] = useState<Stage>(() =>
    file ? { kind: 'reading' } : { kind: 'start' }
  );
  const [part, setPart] = useState<Part>({ start: 0, end: 0 });
  const [problem, setProblem] = useState<string | null>(null);
  // The part squashed, for Play and then Make Sound: made once per part.
  const [made, setMade] = useState<{ part: Part; codes: SoundCodes } | null>(
    null
  );
  const [squashing, setSquashing] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const picker = useRef<HTMLInputElement>(null);
  const preview = made?.part === part ? made.codes : null;
  const { playing, at, play: playPreview, stop } = useSoundPlayer(preview);

  const samples = stage.kind === 'ready' ? stage.samples : null;
  const duration = samples ? samples.length / SOUND_RATE : 0;
  const strip = useMemo(
    () => waveform(samples ? samplePeaks(samples, BARS) : [0], 24),
    [samples]
  );

  const open = useCallback(async (from: Blob) => {
    setStage({ kind: 'reading' });
    setProblem(null);
    try {
      const read = await readSound(from);
      if (read.length < SOUND_RATE / 10) {
        throw new Error('That’s too short to keep. Try something longer.');
      }
      setPart(firstPart(read.length / SOUND_RATE, LONGEST_SOUND));
      setStage({ kind: 'ready', samples: read });
    } catch (error) {
      setProblem(
        error instanceof Error ? error.message : 'That couldn’t be read.'
      );
      setStage({ kind: 'start' });
    }
  }, []);

  useEffect(() => {
    if (file) void open(file);
  }, [file, open]);

  // The recording held, if any, is cancelled when it's let go: the dialog
  // closing, or a stage after it. Cancelling one that's over does nothing.
  const held =
    stage.kind === 'asking' || stage.kind === 'recording'
      ? stage.recording
      : null;
  useEffect(() => (held ? () => held.cancel() : undefined), [held]);

  const finishRecording = useCallback(
    async (recording: Recording) => {
      setStage({ kind: 'reading' });
      const said = await recording.finish();
      if (said) void open(said);
      else setStage({ kind: 'start' });
    },
    [open]
  );

  // The recording's time, and its end at a minute.
  useEffect(() => {
    if (stage.kind !== 'recording') return;
    const timer = setInterval(() => {
      const seconds = (performance.now() - stage.since) / 1000;
      setElapsed(seconds);
      if (seconds >= LONGEST_SOUND) void finishRecording(stage.recording);
    }, 200);
    return () => clearInterval(timer);
  }, [stage, finishRecording]);

  const record = async () => {
    setProblem(null);
    const recording = audio.record((error) => {
      setProblem(recordingProblem(error));
      setStage({ kind: 'start' });
    });
    setStage({ kind: 'asking', recording });
    try {
      if (!(await recording.started)) return;
      setElapsed(0);
      setStage({ kind: 'recording', recording, since: performance.now() });
    } catch (error) {
      setProblem(recordingProblem(error));
      setStage({ kind: 'start' });
    }
  };

  const choose = (next: Part) => {
    stop();
    setPart(next);
  };

  /** The part squashed, made now if it hasn't been. */
  const squashed = async (): Promise<SoundCodes | null> => {
    if (!samples) return null;
    if (preview) return preview;
    setSquashing(true);
    // Lets "Squashing…" show: a minute takes a moment on a phone.
    await new Promise((resolve) => setTimeout(resolve, 20));
    try {
      const codes = squash(samples, part);
      if (isSilent(codes)) {
        setProblem('That part comes out silent: nothing in it is loud enough.');
        return null;
      }
      setProblem(null);
      setMade({ part, codes });
      return codes;
    } finally {
      setSquashing(false);
    }
  };

  const play = async () => {
    if (playing) return stop();
    const codes = await squashed();
    if (codes) playPreview(0, codes);
  };

  const make = async () => {
    const codes = await squashed();
    if (!codes) return;
    stop();
    onDone(codes);
    close();
  };

  useHotkeys(
    'Escape',
    () =>
      stage.kind === 'recording'
        ? void finishRecording(stage.recording)
        : close(),
    { enableOnFormTags: true }
  );

  return (
    <MacDialog title={title} modal wide>
      {stage.kind === 'start' && (
        <DialogMessage icon={SPEAKER}>
          <p>
            Record up to a minute, or choose a song or any sound. It’s squashed
            small, crunchy like an old Mac, before it’s sent.
          </p>
        </DialogMessage>
      )}
      {stage.kind === 'asking' && (
        <DialogMessage icon={SPEAKER}>
          <p aria-live="polite">Waiting for the microphone…</p>
        </DialogMessage>
      )}
      {stage.kind === 'recording' && (
        <DialogMessage icon={SPEAKER}>
          <p aria-live="polite" className={styles.recording}>
            Recording… {clock(elapsed)} of at most {clock(LONGEST_SOUND)}
          </p>
        </DialogMessage>
      )}
      {stage.kind === 'reading' && (
        <DialogMessage icon={SPEAKER}>
          <p aria-live="polite">Reading…</p>
        </DialogMessage>
      )}
      {samples && (
        <Timeline
          duration={duration}
          longest={LONGEST_SOUND}
          part={part}
          onChoose={choose}
          strip={strip}
          playhead={playing ? part.start + at : null}
          disabled={squashing}
        />
      )}
      {problem && (
        <p role="alert" className={styles.problem}>
          {problem}
        </p>
      )}
      <input
        ref={picker}
        type="file"
        accept={SOUND_FILES}
        className={styles.hidden}
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const picked = e.target.files?.[0];
          e.target.value = '';
          if (picked) void open(picked);
        }}
      />
      <DialogButtons>
        {stage.kind === 'recording' ? (
          <Button onClick={() => void finishRecording(stage.recording)}>
            Stop
          </Button>
        ) : (
          <>
            <Button theme="SECONDARY" onClick={() => close()}>
              Cancel
            </Button>
            {(stage.kind === 'start' || stage.kind === 'ready') && (
              <>
                <Button
                  theme="SECONDARY"
                  onClick={() => picker.current?.click()}
                >
                  Choose File…
                </Button>
                <Button theme="SECONDARY" onClick={() => void record()}>
                  Record
                </Button>
              </>
            )}
            {samples && (
              <Button theme="SECONDARY" onClick={() => void play()}>
                {playing ? 'Stop' : 'Play'}
              </Button>
            )}
            {samples && !squashing ? (
              <Button onClick={() => void make()}>Make Sound</Button>
            ) : (
              <Button isDisabled>
                {squashing ? 'Squashing…' : 'Make Sound'}
              </Button>
            )}
          </>
        )}
      </DialogButtons>
    </MacDialog>
  );
}
