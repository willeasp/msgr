import { SOUND_RATE } from '@msgr/media';
import { LONGEST_SOUND_FILE } from '../../lib/files';
import { mono } from '../../lib/sound';

/** Bigger than any file of 15 minutes worth reading: a long lossless one. */
const LARGEST_FILE = 200 * 1024 * 1024;

/**
 * The file's sound as one channel at SOUND_RATE, decoded by the browser,
 * which reads most music and every recording it makes itself. Throws, in
 * words for the person, what's wrong with it.
 */
export async function readSound(file: Blob): Promise<Float32Array> {
  if (file.size > LARGEST_FILE) {
    throw new Error('That file is too big. Choose one of 15 minutes or less.');
  }
  const bytes = await file.arrayBuffer();
  let channels: Float32Array[];
  try {
    channels = await decodeAt(bytes, SOUND_RATE);
  } catch {
    channels = await decodeAt(bytes, null).catch(() => {
      throw new Error('This browser can’t play that file.');
    });
  }
  const sound = mono(channels);
  if (sound.length / SOUND_RATE > LONGEST_SOUND_FILE) {
    throw new Error('That file is too long. Choose one of 15 minutes or less.');
  }
  return sound;
}

/**
 * Decoded by a context at `rate`, which resamples as it decodes; with no
 * rate, at the browser's own, resampled here.
 */
async function decodeAt(
  bytes: ArrayBuffer,
  rate: number | null
): Promise<Float32Array[]> {
  const context = rate
    ? new OfflineAudioContext(1, 1, rate)
    : new AudioContext();
  try {
    // A copy each time: decoding takes the bytes it's given.
    const decoded = await context.decodeAudioData(bytes.slice(0));
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, c) =>
      decoded.getChannelData(c)
    );
    return decoded.sampleRate === SOUND_RATE
      ? channels
      : channels.map((channel) => resample(channel, decoded.sampleRate));
  } finally {
    if (context instanceof AudioContext) void context.close();
  }
}

/** From `rate` to SOUND_RATE, each new sample the average of its stretch. */
function resample(samples: Float32Array, rate: number): Float32Array {
  const step = rate / SOUND_RATE;
  const out = new Float32Array(Math.floor(samples.length / step));
  for (let i = 0; i < out.length; i++) {
    const from = Math.floor(i * step);
    const to = Math.max(from + 1, Math.floor((i + 1) * step));
    let sum = 0;
    for (let j = from; j < to; j++) sum += samples[j];
    out[i] = sum / (to - from);
  }
  return out;
}
