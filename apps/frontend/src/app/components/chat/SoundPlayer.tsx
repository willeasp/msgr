import { useMemo } from 'react';
import type { SoundCodes } from '@msgr/bitmap';
import { clock, secondsOf, soundPeaks, waveform } from '../../../lib/sound';
import { pixelSize, useBitmapCanvas } from '../../hooks/use-bitmap-canvas';
import { useSoundPlayer } from '../../hooks/use-sound';
import { PixelIcon } from '../PixelIcon';
import { PLAY, STOP } from '../icons';
import styles from './SoundPlayer.module.css';

const HEIGHT = 15;

/** A bar for every third of a second, between 12 and 64 of them. */
export const barsFor = (frames: number) =>
  Math.min(64, Math.max(12, Math.round(secondsOf(frames) * 3)));

interface SoundPlayerProps {
  /** How many frames, known before the codes are. */
  frames: number;
  /** The codes, once decoded; until then the shape is a dotted line. */
  codes: SoundCodes | null;
}

/**
 * A sound: Play, its shape in 1 bit, and its length. While it plays, the
 * shape fills in solid from the left and the time counts up; a click on the
 * shape plays from there.
 */
export function SoundPlayer({ frames, codes }: SoundPlayerProps) {
  const bars = barsFor(frames);
  const seconds = secondsOf(frames);
  const { playing, at, play, stop } = useSoundPlayer(codes);
  const peaks = useMemo(
    () => (codes ? soundPeaks(codes, bars) : Array<number>(bars).fill(0)),
    [codes, bars]
  );
  // Redrawn only when another bar fills in.
  const filled = playing ? Math.floor((at / seconds) * bars) : bars;
  const shape = useMemo(
    () => waveform(peaks, HEIGHT, filled / bars),
    [peaks, filled, bars]
  );
  const { ref } = useBitmapCanvas(shape);

  return (
    <span className={styles.player}>
      <button
        type="button"
        className={styles.button}
        disabled={!codes}
        aria-label={playing ? 'Stop sound' : 'Play sound'}
        onClick={() => (playing ? stop() : play())}
      >
        <PixelIcon bitmap={playing ? STOP : PLAY} scale={1} />
      </button>
      <canvas
        ref={ref}
        width={shape.width}
        height={shape.height}
        className={styles.wave}
        style={pixelSize(shape)}
        aria-hidden
        onClick={(e) => {
          const box = e.currentTarget.getBoundingClientRect();
          play(((e.clientX - box.left) / box.width) * seconds);
        }}
      />
      <span className={styles.time}>{clock(playing ? at : seconds)}</span>
    </span>
  );
}
