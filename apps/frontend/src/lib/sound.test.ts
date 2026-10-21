import { analyseSound, getPixel, SOUND_RATE, type Bits } from '@msgr/bitmap';
import { describe, expect, it } from 'vitest';
import {
  clock,
  evenOut,
  mono,
  partOf,
  samplePeaks,
  secondsOf,
  soundPeaks,
  squash,
  waveform,
} from './sound';

/** `seconds` of a sine at `hz`, at `volume`. */
const tone = (hz: number, seconds: number, volume = 0.5) =>
  Float32Array.from(
    { length: Math.round(seconds * SOUND_RATE) },
    (_, i) => volume * Math.sin((2 * Math.PI * hz * i) / SOUND_RATE)
  );

const peak = (samples: Float32Array) =>
  samples.reduce((most, s) => Math.max(most, Math.abs(s)), 0);

const rows = (bits: Bits) =>
  Array.from({ length: bits.height }, (_, y) =>
    Array.from({ length: bits.width }, (_, x) =>
      getPixel(bits, x, y) ? '#' : '.'
    ).join('')
  );

describe('making a sound', () => {
  it('mixes channels to one', () => {
    const left = Float32Array.from([1, 0, 0.5]);
    const right = Float32Array.from([0, 0, 0.5]);
    expect(Array.from(mono([left, right]))).toEqual([0.5, 0, 0.5]);
    expect(mono([left])).toBe(left);
    expect(mono([])).toHaveLength(0);
  });

  it('takes the part chosen, in seconds', () => {
    const samples = tone(440, 3);
    expect(partOf(samples, { start: 1, end: 2.5 })).toHaveLength(
      1.5 * SOUND_RATE
    );
    expect(partOf(samples, { start: 2, end: 9 })).toHaveLength(SOUND_RATE);
  });

  it('brings a quiet sound up and a loud one down, to just under full', () => {
    expect(peak(evenOut(tone(440, 1, 0.01)))).toBeCloseTo(0.95, 2);
    expect(peak(evenOut(tone(440, 1, 1)))).toBeCloseTo(0.95, 2);
  });

  it('brings quiet and loud closer together', () => {
    const quietThenLoud = Float32Array.from([
      ...tone(440, 1, 0.05),
      ...tone(440, 1, 0.8),
    ]);
    const out = evenOut(quietThenLoud);
    const quiet = peak(out.subarray(SOUND_RATE / 2, SOUND_RATE));
    const loud = peak(out.subarray(SOUND_RATE * 1.5));
    // 24 dB apart before; well under half that after.
    expect(20 * Math.log10(loud / quiet)).toBeLessThan(10);
  });

  it('cuts rumble but keeps a voice', () => {
    const rumble = peak(evenOut(tone(30, 1)).subarray(SOUND_RATE / 2));
    const low = tone(30, 1);
    const voice = tone(300, 1).map((s, i) => s + low[i]);
    const kept = evenOut(voice).subarray(SOUND_RATE / 2);
    // Alone, rumble is still brought up; beside a voice it's mostly gone.
    expect(rumble).toBeGreaterThan(0.5);
    expect(peak(kept)).toBeCloseTo(0.95, 1);
  });

  it('leaves silence silent', () => {
    expect(peak(evenOut(new Float32Array(SOUND_RATE)))).toBe(0);
  });

  it('squashes the part, as long as it is', () => {
    const codes = squash(tone(440, 10), { start: 2, end: 4 });
    expect(secondsOf(codes.frames)).toBeCloseTo(2, 1);
  });
});

describe('showing a sound', () => {
  it('tells the time', () => {
    expect(clock(0)).toBe('0:00');
    expect(clock(42.9)).toBe('0:42');
    expect(clock(725)).toBe('12:05');
  });

  it('measures peaks from the samples, loudest at 1, silence at 0', () => {
    const samples = Float32Array.from([
      ...tone(440, 1, 0.5),
      ...new Float32Array(SOUND_RATE),
      ...tone(440, 1, 0.05),
    ]);
    const [loud, quiet, softer] = samplePeaks(samples, 3);
    expect(loud).toBeCloseTo(1);
    expect(quiet).toBe(0);
    // 20 dB down of 24.
    expect(softer).toBeCloseTo(1 - 20 / 24, 1);
  });

  it('reads peaks from a sound without playing it', () => {
    const codes = analyseSound(
      Float32Array.from([...tone(440, 1), ...new Float32Array(SOUND_RATE)])
    );
    const [sounding, silent] = soundPeaks(codes, 2);
    expect(sounding).toBeCloseTo(1);
    expect(silent).toBe(0);
    expect(soundPeaks(codes, 500)).toHaveLength(500);
  });

  it('draws bars every other column, solid where played and grey to come', () => {
    expect(rows(waveform([1, 0, 1, 0.5], 5, 0.5))).toEqual([
      '#...#..',
      '#.....#',
      '#.#.#..',
      '#.....#',
      '#...#..',
    ]);
  });
});
