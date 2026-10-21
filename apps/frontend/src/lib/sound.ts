import {
  analyseSound,
  BAND_EDGES,
  blank,
  setPixel,
  SOUND_RATE,
  soundLength,
  type Bits,
  type SoundCodes,
} from '@msgr/bitmap';
import type { Part } from './trim';

/**
 * What sound files are called. Pickers ask for these by name: an iPhone
 * offers its photo library for `audio/*` and may grey out an MP3 in Files,
 * but opens Files for a list of extensions.
 */
export const SOUND_EXTENSIONS = [
  '.mp3',
  '.m4a',
  '.aac',
  '.wav',
  '.aif',
  '.aiff',
  '.caf',
  '.flac',
  '.ogg',
  '.oga',
  '.opus',
  '.weba',
  '.amr',
] as const;

/** For a file picker's `accept`. */
export const SOUND_FILES = SOUND_EXTENSIONS.join(',');

/** A sound file, by its type or else its name: phones don't always say. */
export const isSoundFile = ({ type, name }: { type: string; name: string }) =>
  type.startsWith('audio/') ||
  (!type &&
    SOUND_EXTENSIONS.some((extension) =>
      name.toLowerCase().endsWith(extension)
    ));

/** The longest file a sound can be cut from, in seconds. */
export const LONGEST_FILE = 15 * 60;

/** "0:42", or "12:05". */
export const clock = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(
    2,
    '0'
  )}`;

/** How long a sound of `frames` frames plays, in seconds. */
export const secondsOf = (frames: number) => soundLength(frames) / SOUND_RATE;

/** One channel from several: their average. */
export function mono(channels: readonly Float32Array[]): Float32Array {
  const [first] = channels;
  if (!first || channels.length === 1) return first ?? new Float32Array();
  const out = new Float32Array(first.length);
  for (const channel of channels) {
    for (let i = 0; i < out.length; i++) out[i] += channel[i] ?? 0;
  }
  for (let i = 0; i < out.length; i++) out[i] /= channels.length;
  return out;
}

/** The samples of `part`, at SOUND_RATE, as a copy. */
export const partOf = (samples: Float32Array, { start, end }: Part) =>
  samples.slice(
    Math.max(0, Math.round(start * SOUND_RATE)),
    Math.min(samples.length, Math.round(end * SOUND_RATE))
  );

const decibels = (level: number) => 20 * Math.log10(level);
const level = (decibels: number) => Math.pow(10, decibels / 20);

/**
 * The samples, evened out for a small, crunchy sound: rumble below 90 Hz
 * cut, loud and quiet brought together (6:1 above -28 dB, letting go over
 * 120 ms), then made as loud as fits. The compressor looks 3 ms ahead, so
 * no sudden sound slips past it to set how loud the rest can be. Silence
 * stays silent.
 */
export function evenOut(samples: Float32Array): Float32Array {
  const filtered = new Float32Array(samples.length);
  // A second-order high-pass at 90 Hz (RBJ's cookbook).
  const w = (2 * Math.PI * 90) / SOUND_RATE;
  const alpha = Math.sin(w) / (2 * Math.SQRT1_2);
  const cos = Math.cos(w);
  const a0 = 1 + alpha;
  const [b0, b1, b2] = [
    (1 + cos) / 2 / a0,
    -(1 + cos) / a0,
    (1 + cos) / 2 / a0,
  ];
  const [a1, a2] = [(-2 * cos) / a0, (1 - alpha) / a0];
  let [x1, x2, y1, y2] = [0, 0, 0, 0];
  for (let i = 0; i < samples.length; i++) {
    const x = samples[i];
    const y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    [x2, x1, y2, y1] = [x1, x, y1, y];
    filtered[i] = y;
  }
  const ahead = Math.round(0.003 * SOUND_RATE);
  const release = Math.exp(-1 / (0.12 * SOUND_RATE));
  const threshold = -28;
  const ratio = 6;
  const out = new Float32Array(samples.length);
  let envelope = 0;
  let peak = 0;
  for (let i = 0; i < filtered.length; i++) {
    let coming = 0;
    const last = Math.min(filtered.length, i + ahead + 1);
    for (let j = i; j < last; j++)
      coming = Math.max(coming, Math.abs(filtered[j]));
    envelope =
      coming > envelope ? coming : release * envelope + (1 - release) * coming;
    const over = envelope > 0 ? decibels(envelope) - threshold : 0;
    out[i] = filtered[i] * (over > 0 ? level(over / ratio - over) : 1);
    peak = Math.max(peak, Math.abs(out[i]));
  }
  // Too quiet to be anything but noise: left as it is, to come out silent.
  if (peak < 1e-4) return out;
  const scale = 0.95 / peak;
  for (let i = 0; i < out.length; i++) out[i] *= scale;
  return out;
}

/** The part of the samples, at SOUND_RATE, evened out and squashed. */
export const squash = (samples: Float32Array, part: Part): SoundCodes =>
  analyseSound(evenOut(partOf(samples, part)));

/** How loud, from 0 to 1, over a range of 24 dB down from the loudest. */
const heights = (powers: readonly number[]) => {
  const loudest = Math.max(0, ...powers);
  if (!loudest) return powers.map(() => 0);
  return powers.map((power) =>
    power > 0 ? Math.max(0, 1 + (10 * Math.log10(power / loudest)) / 24) : 0
  );
};

/** `bars` heights from 0 to 1 over the samples: each its stretch's peak. */
export function samplePeaks(samples: Float32Array, bars: number): number[] {
  const powers = Array.from({ length: bars }, (_, bar) => {
    const from = Math.floor((bar * samples.length) / bars);
    const to = Math.floor(((bar + 1) * samples.length) / bars);
    let peak = 0;
    for (let i = from; i < to; i++) peak = Math.max(peak, Math.abs(samples[i]));
    return peak * peak;
  });
  return heights(powers);
}

// Each band's width, to weigh its loudness by.
const BAND_WIDTHS = BAND_EDGES.slice(1).map((edge, b) => edge - BAND_EDGES[b]);

/**
 * `bars` heights from 0 to 1 over a sound, read from its bands' loudness
 * alone, so it shows without the sound being made into samples.
 */
export function soundPeaks(codes: SoundCodes, bars: number): number[] {
  const bands = BAND_WIDTHS.length;
  const power = (frame: number) => {
    let sum = 0;
    for (let b = 0; b < bands; b++) {
      const loudness = codes.loudness[frame * bands + b];
      if (loudness) sum += BAND_WIDTHS[b] * Math.pow(2, loudness);
    }
    return sum;
  };
  // The first frame only fades in the second; frames 1 on each centre on
  // a stretch of the sound.
  const playing = codes.frames - 1;
  const powers = Array.from({ length: bars }, (_, bar) => {
    const from = 1 + Math.floor((bar * playing) / bars);
    const to = Math.max(from + 1, 1 + Math.floor(((bar + 1) * playing) / bars));
    let loudest = 0;
    for (let f = from; f < Math.min(to, codes.frames); f++) {
      loudest = Math.max(loudest, power(f));
    }
    return loudest;
  });
  return heights(powers);
}

/**
 * A waveform in 1 bit: a bar every other column, centred, at least a dot
 * high. Bars before `played` (0 to 1) are solid; the rest are grey, every
 * other pixel inked, as a Mac draws what's still to come.
 */
export function waveform(
  peaks: readonly number[],
  height: number,
  played = 1
): Bits {
  const bits = blank(peaks.length * 2 - 1 || 1, height);
  const middle = (height - 1) / 2;
  peaks.forEach((peak, bar) => {
    const solid = (bar + 0.5) / peaks.length <= played;
    const reach = Math.max(0.5, (peak * (height - 1)) / 2);
    for (let y = 0; y < height; y++) {
      if (Math.abs(y - middle) > reach) continue;
      if (solid || (y + bar) % 2 === 0) setPixel(bits, bar * 2, y, true);
    }
  });
  return bits;
}
