import { analyseSound, encodeSound, SOUND_RATE, toBase64 } from '@msgr/bitmap';
import { Sound } from '../domain/sound.js';

/**
 * A sound as a browser sends it: `seconds` of a tone at `hz`, or of silence
 * at 0 Hz.
 */
export function soundInput(seconds = 0.5, hz = 440) {
  const samples = Float32Array.from(
    { length: Math.round(seconds * SOUND_RATE) },
    (_, i) => (hz ? 0.5 * Math.sin((2 * Math.PI * hz * i) / SOUND_RATE) : 0)
  );
  const codes = analyseSound(samples);
  return { frames: codes.frames, bits: toBase64(encodeSound(codes)) };
}

/** The same sound, parsed as the server keeps it. */
export function exampleSound(...args: Parameters<typeof soundInput>) {
  const parsed = Sound.parse(soundInput(...args));
  if (!parsed.ok) throw new Error(parsed.error.reason);
  return parsed.value;
}
