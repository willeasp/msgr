import {
  adaptiveOdds,
  rangeDecoder,
  rangeEncoder,
  type Odds,
  type RangeDecoder,
  type RangeEncoder,
} from './range-coder.js';

/*
 * A sound is squashed on purpose, the way a picture is dithered to 1 bit:
 * 8,000 samples a second, cut into frames of 20 ms, each frame turned into
 * 160 frequencies (an MDCT, as Opus and MP3 do) and grouped into 13 bands,
 * narrow low and wide high. A frame keeps each band's loudness, in 3 dB
 * steps, and its frequencies only roughly: most round to nothing, and what's
 * lost is played back as quiet noise at the band's loudness. That's the
 * crunch. Every number is then coded with the range coder.
 *
 * What's kept, `SoundCodes`, is all whole numbers, so the server can decode
 * and code them again exactly; turning them into samples is for browsers.
 */

/** Samples a second, played and coded. */
export const SOUND_RATE = 8000;

/** Samples a frame, and the frequencies each frame keeps. */
export const FRAME_LENGTH = 160;

/** The longest sound, in seconds. */
export const LONGEST_SOUND = 60;

/**
 * The most frames a sound may have. Frames overlap by half, so a sound of
 * `frames` frames plays `(frames - 1) × 160` samples.
 */
export const MAX_SOUND_FRAMES = (LONGEST_SOUND * SOUND_RATE) / FRAME_LENGTH + 1;

/** Where each band's frequencies start, and the last one ends. */
const EDGES = [0, 4, 9, 15, 22, 30, 39, 50, 63, 78, 96, 117, 142, 160];
const BANDS = EDGES.length - 1;

/** A band's loudness runs from 0, silent, to this, in 3 dB steps. */
const LOUDEST = 40;

/**
 * How coarsely frequencies are rounded, against their band's loudness:
 * bigger is smaller and crunchier. At 3, no frequency can be more than a
 * step from nothing: a band's loudest frequency is at most √width times
 * its loudness, under a step in every band, so each level is -1, 0 or 1,
 * and most are 0.
 */
const COARSENESS = 3;
const MAX_LEVEL = 1;

/**
 * What a sound keeps of itself: each frame's band loudnesses, 0 to 40, and
 * the level of each of its 160 frequencies, -1, 0 or 1, all 0 in a silent
 * band.
 */
export interface SoundCodes {
  readonly frames: number;
  /** `frames × 13` loudnesses, frame after frame. */
  readonly loudness: Uint8Array<ArrayBuffer>;
  /** `frames × 160` levels, frame after frame. */
  readonly levels: Int16Array<ArrayBuffer>;
}

/** How many samples a sound of `frames` frames plays. */
export const soundLength = (frames: number) =>
  Math.max(0, frames - 1) * FRAME_LENGTH;

/** The frames it takes to play `samples` samples. */
export const framesFor = (samples: number) =>
  Math.ceil(samples / FRAME_LENGTH) + 1;

export const isValidFrameCount = (frames: number) =>
  Number.isInteger(frames) && frames >= 2 && frames <= MAX_SOUND_FRAMES;

/** True when every band of every frame is silent: nothing would play. */
export const isSilent = (codes: SoundCodes) =>
  codes.loudness.every((band) => band === 0);

/**
 * The most bytes `encodeSound` makes of `frames` frames. A frame's 160
 * levels and 13 loudnesses can't take much over 40 bytes even with odds
 * still to learn, and the busiest sounds tried average 11; so this is
 * comfortably above any honest sound, and a server can refuse more before
 * decoding anything.
 */
export const maxSoundCodedLength = (frames: number) => frames * 96 + 4096;

// ---------------------------------------------------------------------------
// Coding numbers

/** Contexts per number: 16 for its unary part, the last for escaped bits. */
const UNARY = 16;
const ESCAPE_BITS = 12;

/** A whole number: up to 16 ones then a zero, or 16 ones and 12 more bits. */
function codeCount(
  coder: RangeEncoder,
  odds: Odds,
  context: number,
  n: number
) {
  for (let i = 0; i < UNARY; i++) {
    const more = n > i ? 1 : 0;
    coder.code(odds, context * UNARY + i, more);
    if (!more) return;
  }
  for (let b = ESCAPE_BITS - 1; b >= 0; b--) {
    coder.code(odds, context * UNARY + UNARY - 1, ((n - UNARY) >> b) & 1);
  }
}

function readCount(coder: RangeDecoder, odds: Odds, context: number): number {
  for (let i = 0; i < UNARY; i++) {
    if (!coder.code(odds, context * UNARY + i)) return i;
  }
  let n = 0;
  for (let b = 0; b < ESCAPE_BITS; b++) {
    n = (n << 1) | coder.code(odds, context * UNARY + UNARY - 1);
  }
  return n + UNARY;
}

/** Its size as a count, then its sign unless it's zero. */
function codeSigned(
  coder: RangeEncoder,
  odds: Odds,
  context: number,
  n: number
) {
  codeCount(coder, odds, context * 2, Math.abs(n));
  if (n) coder.code(odds, (context * 2 + 1) * UNARY, n < 0 ? 1 : 0);
}

function readSigned(coder: RangeDecoder, odds: Odds, context: number): number {
  const size = readCount(coder, odds, context * 2);
  if (!size) return 0;
  return coder.code(odds, (context * 2 + 1) * UNARY) ? -size : size;
}

/*
 * A band's loudness is foretold from the same band a frame before and the
 * band below in this frame; only the difference is coded, in a context per
 * band. A level's context is its band, and how big the same frequency was a
 * frame before and the one below it is in this frame, each 0 to 3.
 */

const LOUDNESS_CONTEXTS = BANDS * 2 * UNARY;
const LEVEL_CONTEXTS = 16 * 16 * 2 * UNARY;
const COUNT_LIMIT = 255;

const foretold = (previous: Uint8Array, band: number, below: number) =>
  band === 0 ? previous[0] : (previous[band] + below + 1) >> 1;

const levelContext = (
  band: number,
  before: Uint8Array,
  now: Uint8Array,
  k: number
) =>
  band * 16 +
  Math.min(3, before[k]) * 4 +
  Math.min(3, k > EDGES[band] ? now[k - 1] : 0);

/** The sound's codes, coded. */
export function encodeSound(codes: SoundCodes): Uint8Array<ArrayBuffer> {
  const coder = rangeEncoder();
  const loudnessOdds = adaptiveOdds(LOUDNESS_CONTEXTS, COUNT_LIMIT);
  const levelOdds = adaptiveOdds(LEVEL_CONTEXTS, COUNT_LIMIT);
  const previous = new Uint8Array(BANDS);
  let before = new Uint8Array(FRAME_LENGTH);
  let now = new Uint8Array(FRAME_LENGTH);
  for (let f = 0; f < codes.frames; f++) {
    let below = 0;
    for (let b = 0; b < BANDS; b++) {
      const loudness = codes.loudness[f * BANDS + b];
      codeSigned(
        coder,
        loudnessOdds,
        b,
        loudness - foretold(previous, b, below)
      );
      previous[b] = below = loudness;
      for (let k = EDGES[b]; k < EDGES[b + 1]; k++) {
        const level = loudness ? codes.levels[f * FRAME_LENGTH + k] : 0;
        if (loudness) {
          codeSigned(coder, levelOdds, levelContext(b, before, now, k), level);
        }
        now[k] = Math.min(255, Math.abs(level));
      }
    }
    [before, now] = [now, before];
  }
  return coder.finish();
}

/**
 * Exactly `frames` frames, whatever the bytes: past their end they read as
 * zeros, so the work is bounded by the length asked for. A loudness outside
 * 0 to 40, or a level outside -1 to 1, is kept within it, so bytes that say
 * one aren't how `encodeSound` codes what they decode to.
 */
export function decodeSound(coded: Uint8Array, frames: number): SoundCodes {
  const coder = rangeDecoder(coded);
  const loudnessOdds = adaptiveOdds(LOUDNESS_CONTEXTS, COUNT_LIMIT);
  const levelOdds = adaptiveOdds(LEVEL_CONTEXTS, COUNT_LIMIT);
  const loudness = new Uint8Array(frames * BANDS);
  const levels = new Int16Array(frames * FRAME_LENGTH);
  const previous = new Uint8Array(BANDS);
  let before = new Uint8Array(FRAME_LENGTH);
  let now = new Uint8Array(FRAME_LENGTH);
  for (let f = 0; f < frames; f++) {
    let below = 0;
    for (let b = 0; b < BANDS; b++) {
      const told = foretold(previous, b, below);
      const band = Math.min(
        LOUDEST,
        Math.max(0, told + readSigned(coder, loudnessOdds, b))
      );
      loudness[f * BANDS + b] = band;
      previous[b] = below = band;
      for (let k = EDGES[b]; k < EDGES[b + 1]; k++) {
        const level = band
          ? Math.min(
              MAX_LEVEL,
              Math.max(
                -MAX_LEVEL,
                readSigned(coder, levelOdds, levelContext(b, before, now, k))
              )
            )
          : 0;
        levels[f * FRAME_LENGTH + k] = level;
        now[k] = Math.min(255, Math.abs(level));
      }
    }
    [before, now] = [now, before];
  }
  return { frames, loudness, levels };
}

// ---------------------------------------------------------------------------
// Samples: browsers only, and never checked, so floating point is fine.

const taper = Float64Array.from({ length: 2 * FRAME_LENGTH }, (_, n) =>
  Math.sin((Math.PI * (n + 0.5)) / (2 * FRAME_LENGTH))
);

let cosines: Float64Array | null = null;
/** cos(π/N (n + ½ + N/2)(k + ½)), made on first use. */
function basis(): Float64Array {
  if (cosines) return cosines;
  const N = FRAME_LENGTH;
  cosines = new Float64Array(N * 2 * N);
  for (let k = 0; k < N; k++) {
    for (let n = 0; n < 2 * N; n++) {
      cosines[k * 2 * N + n] = Math.cos(
        (Math.PI / N) * (n + 0.5 + N / 2) * (k + 0.5)
      );
    }
  }
  return cosines;
}

/** A band's loudness as the root mean square of its frequencies. */
const bandLevel = (loudness: number) => Math.pow(2, loudness / 2) / 32768;

/** How far apart a band's levels are, by its loudness and how high it is. */
const stepOf = (loudness: number, band: number) =>
  bandLevel(loudness) * COARSENESS * (1 + band / BANDS);

/**
 * The codes for `samples`, at 8,000 a second and between -1 and 1: up to
 * 60 seconds of them, and any more are left off.
 */
export function analyseSound(samples: Float32Array): SoundCodes {
  const N = FRAME_LENGTH;
  const length = Math.min(samples.length, soundLength(MAX_SOUND_FRAMES));
  const frames = Math.max(2, framesFor(length));
  // A frame of silence before, so frame f covers samples (f - 1)N to (f + 1)N.
  const padded = new Float64Array((frames + 1) * N);
  for (let i = 0; i < length; i++) padded[i + N] = samples[i];
  const cos = basis();
  const loudness = new Uint8Array(frames * BANDS);
  const levels = new Int16Array(frames * N);
  const spectrum = new Float64Array(N);
  for (let f = 0; f < frames; f++) {
    for (let k = 0; k < N; k++) {
      let sum = 0;
      for (let n = 0; n < 2 * N; n++) {
        sum += padded[f * N + n] * taper[n] * cos[k * 2 * N + n];
      }
      spectrum[k] = sum;
    }
    for (let b = 0; b < BANDS; b++) {
      const lo = EDGES[b];
      const hi = EDGES[b + 1];
      let energy = 0;
      for (let k = lo; k < hi; k++) energy += spectrum[k] * spectrum[k];
      const rms = Math.sqrt(energy / (hi - lo));
      const band =
        rms > 0
          ? Math.min(
              LOUDEST,
              Math.max(0, Math.round(Math.log2(rms * 32768) * 2))
            )
          : 0;
      loudness[f * BANDS + b] = band;
      if (!band) continue;
      const step = stepOf(band, b);
      for (let k = lo; k < hi; k++) {
        levels[f * N + k] = Math.min(
          MAX_LEVEL,
          Math.max(-MAX_LEVEL, Math.round(spectrum[k] / step))
        );
      }
    }
  }
  return { frames, loudness, levels };
}

/**
 * The samples the codes play, 8,000 a second: `soundLength(frames)` of them.
 * What was rounded to nothing plays as noise at its band's loudness; the
 * noise is the same every time.
 */
export function synthesizeSound(codes: SoundCodes): Float32Array<ArrayBuffer> {
  const N = FRAME_LENGTH;
  const { frames } = codes;
  const cos = basis();
  const out = new Float64Array((frames + 1) * N);
  const spectrum = new Float64Array(N);
  let seed = 1;
  const noise = () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x40000000 - 1;
  };
  for (let f = 0; f < frames; f++) {
    for (let b = 0; b < BANDS; b++) {
      const band = codes.loudness[f * BANDS + b];
      const step = stepOf(band, b);
      const fill = Math.min(step * 0.5, bandLevel(band)) * 0.7;
      for (let k = EDGES[b]; k < EDGES[b + 1]; k++) {
        const level = codes.levels[f * N + k];
        spectrum[k] = !band ? 0 : level ? level * step : noise() * fill;
      }
    }
    for (let n = 0; n < 2 * N; n++) {
      let sum = 0;
      for (let k = 0; k < N; k++) sum += spectrum[k] * cos[k * 2 * N + n];
      out[f * N + n] += (sum * taper[n] * 2) / N;
    }
  }
  const length = soundLength(frames);
  const samples = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    samples[i] = Math.min(1, Math.max(-1, out[i + N]));
  }
  return samples;
}
