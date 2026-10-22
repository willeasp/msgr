import { describe, expect, it } from 'vitest';
import {
  analyseSound,
  decodeSound,
  encodeSound,
  FRAME_LENGTH,
  framesFor,
  isSilent,
  isValidFrameCount,
  LONGEST_SOUND,
  MAX_SOUND_FRAMES,
  maxSoundCodedLength,
  SOUND_RATE,
  soundLength,
  synthesizeSound,
  type SoundCodes,
} from './sound.js';

/** `seconds` of a sine at `hz`, at `volume`. */
const tone = (hz: number, seconds: number, volume = 0.5) =>
  Float32Array.from(
    { length: Math.round(seconds * SOUND_RATE) },
    (_, i) => volume * Math.sin((2 * Math.PI * hz * i) / SOUND_RATE)
  );

/** `seconds` of loud, repeatable noise: the busiest a sound gets. */
function noise(seconds: number) {
  let seed = 7;
  return Float32Array.from({ length: seconds * SOUND_RATE }, () => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff;
    return seed / 0x40000000 - 1;
  });
}

const rms = (samples: Float32Array) =>
  Math.sqrt(samples.reduce((sum, s) => sum + s * s, 0) / samples.length);

/** Rising zero crossings a second: a pure tone's frequency. */
const pitch = (samples: Float32Array) => {
  let rising = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i - 1] < 0 && samples[i] >= 0) rising++;
  }
  return rising / (samples.length / SOUND_RATE);
};

const same = (a: SoundCodes, b: SoundCodes) =>
  a.frames === b.frames &&
  a.loudness.every((v, i) => v === b.loudness[i]) &&
  a.levels.every((v, i) => v === b.levels[i]);

describe('a sound', () => {
  it('plays 8,000 samples a second, in frames of 20 ms, for up to a minute', () => {
    expect(SOUND_RATE).toBe(8000);
    expect(FRAME_LENGTH).toBe(160);
    expect(LONGEST_SOUND).toBe(60);
    expect(soundLength(MAX_SOUND_FRAMES)).toBe(60 * SOUND_RATE);
    expect(isValidFrameCount(MAX_SOUND_FRAMES)).toBe(true);
    expect(isValidFrameCount(MAX_SOUND_FRAMES + 1)).toBe(false);
    expect(isValidFrameCount(1)).toBe(false);
    expect(isValidFrameCount(2.5)).toBe(false);
  });

  it('takes the frames that play every sample, and plays that long', () => {
    const codes = analyseSound(tone(440, 1));
    expect(codes.frames).toBe(framesFor(SOUND_RATE));
    expect(synthesizeSound(codes).length).toBe(
      soundLength(framesFor(SOUND_RATE))
    );
    expect(soundLength(framesFor(SOUND_RATE))).toBeGreaterThanOrEqual(
      SOUND_RATE
    );
  });

  it('leaves off anything past a minute', () => {
    expect(analyseSound(tone(440, 61)).frames).toBe(MAX_SOUND_FRAMES);
  });

  it('decodes to exactly the codes it was coded from', () => {
    for (const samples of [tone(440, 2), noise(2), tone(110, 0.5, 0.01)]) {
      const codes = analyseSound(samples);
      expect(same(decodeSound(encodeSound(codes), codes.frames), codes)).toBe(
        true
      );
    }
  });

  it('plays a tone back at its pitch and about its loudness', () => {
    const played = synthesizeSound(analyseSound(tone(440, 2)));
    // Past the first frame, which fades in.
    const steady = played.subarray(FRAME_LENGTH * 2);
    expect(pitch(steady)).toBeGreaterThan(400);
    expect(pitch(steady)).toBeLessThan(480);
    const decibels = 20 * Math.log10(rms(steady) / rms(tone(440, 1)));
    expect(Math.abs(decibels)).toBeLessThan(3);
  });

  it('is squashed: a minute of a tone takes under 16 KB, not 480 as bytes', () => {
    expect(encodeSound(analyseSound(tone(440, 60))).length).toBeLessThan(16000);
  });

  it('knows silence, and codes it to almost nothing', () => {
    const quiet = analyseSound(new Float32Array(SOUND_RATE * 10));
    expect(isSilent(quiet)).toBe(true);
    expect(encodeSound(quiet).length).toBeLessThan(100);
    expect(isSilent(analyseSound(tone(440, 0.1)))).toBe(false);
  });

  it('keeps every frequency within a step of nothing', () => {
    const codes = analyseSound(noise(2));
    expect(codes.levels.every((level) => Math.abs(level) <= 1)).toBe(true);
    expect(codes.levels.some((level) => level !== 0)).toBe(true);
  });

  it('codes the loudest, busiest minute within the most a server takes', () => {
    const codes = analyseSound(noise(60));
    expect(encodeSound(codes).length).toBeLessThan(
      maxSoundCodedLength(codes.frames)
    );
  });

  it('decodes any bytes to exactly the frames asked for', () => {
    const junk = Uint8Array.from({ length: 300 }, (_, i) => (i * 37) & 0xff);
    const codes = decodeSound(junk, 50);
    expect(codes.frames).toBe(50);
    expect(codes.loudness.every((band) => band <= 40)).toBe(true);
    expect(codes.levels.every((level) => Math.abs(level) <= 1)).toBe(true);
    expect(synthesizeSound(codes).length).toBe(soundLength(50));
  });
});
