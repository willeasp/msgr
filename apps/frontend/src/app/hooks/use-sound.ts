import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import { SOUND_RATE, synthesizeSound, type SoundCodes } from '@msgr/bitmap';
import { soundCodes, soundKey, type WireSound } from '../../lib/sound-wire';

/*
 * One sound plays at a time, page-wide, as on a Mac: starting one stops
 * whichever was playing. Sounds are made into samples on first play and
 * kept while their codes are.
 */

interface Playing {
  /** The player that started it: each message's own, or a dialog's. */
  readonly owner: string;
  readonly source: AudioBufferSourceNode;
  /** The context's time when it started, and from where in the sound. */
  readonly startedAt: number;
  readonly from: number;
  readonly duration: number;
}

let context: AudioContext | null = null;
let playing: Playing | null = null;
const listeners = new Set<() => void>();
const buffers = new WeakMap<SoundCodes, AudioBuffer>();

const changed = () => {
  for (const listener of listeners) listener();
};

function bufferOf(audio: AudioContext, codes: SoundCodes): AudioBuffer {
  const kept = buffers.get(codes);
  if (kept) return kept;
  const samples = synthesizeSound(codes);
  let buffer: AudioBuffer;
  try {
    buffer = audio.createBuffer(1, Math.max(1, samples.length), SOUND_RATE);
    buffer.copyToChannel(samples, 0);
  } catch {
    // A browser that won't hold 8,000 samples a second gets 6 times as
    // many, each step drawn as a line to the next.
    const times = 6;
    buffer = audio.createBuffer(
      1,
      Math.max(1, samples.length * times),
      SOUND_RATE * times
    );
    const out = buffer.getChannelData(0);
    for (let i = 0; i < samples.length; i++) {
      const next = samples[i + 1] ?? 0;
      for (let t = 0; t < times; t++) {
        out[i * times + t] = samples[i] + ((next - samples[i]) * t) / times;
      }
    }
  }
  buffers.set(codes, buffer);
  return buffer;
}

/**
 * What the page tells an iPhone it's doing with sound (Safari 16.4 on):
 * playing like music, so the silent switch doesn't mute it; recording,
 * which iOS refuses while the page says it only plays; or nothing special.
 * It stays as set until changed, so recording sets it back when done.
 */
export function setAudioFor(purpose: 'playback' | 'play-and-record' | 'auto') {
  const { audioSession } = navigator as { audioSession?: { type: string } };
  if (audioSession) audioSession.type = purpose;
}

/**
 * The page's audio, made afresh when the last one is closed or stuck: iOS
 * leaves a context "interrupted" once the app has been away, for a call,
 * the lock screen or a notification opening it, and resuming rarely brings
 * it back. Call it from a click, which a new context needs.
 */
function audio(): AudioContext {
  const state = context?.state as string | undefined;
  if (context && (state === 'closed' || state === 'interrupted')) {
    void context.close().catch(() => undefined);
    context = null;
  }
  context ??= new AudioContext();
  // Phones start a context suspended until something is pressed.
  void context.resume();
  return context;
}

// Away from the page, the sound stops and its audio is let go; the next
// play makes new audio, rather than finding it stuck.
if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) return;
    stopSound();
    void context?.close().catch(() => undefined);
    context = null;
  });
}

/** Stops whatever sound is playing, or only `owner`'s if it's given. */
export function stopSound(owner?: string) {
  if (!playing || (owner && playing.owner !== owner)) return;
  const { source } = playing;
  playing = null;
  source.onended = null;
  try {
    source.stop();
  } catch {
    // Already stopped with its context.
  }
  changed();
}

/** Plays the sound from `from` seconds, stopping any other. Call it from a click. */
function playSound(codes: SoundCodes, owner: string, from: number) {
  stopSound();
  setAudioFor('playback');
  const context = audio();
  const buffer = bufferOf(context, codes);
  const source = context.createBufferSource();
  source.buffer = buffer;
  source.connect(context.destination);
  const at = Math.min(Math.max(0, from), buffer.duration);
  source.onended = () => {
    if (playing?.source !== source) return;
    playing = null;
    changed();
  };
  try {
    source.start(0, at);
  } catch {
    // A context closed under it: the next press makes a new one.
    return;
  }
  playing = {
    owner,
    source,
    startedAt: context.currentTime,
    from: at,
    duration: buffer.duration,
  };
  changed();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * A player for one sound: whether it's the one playing, and how far in, in
 * seconds, updated every frame while it plays. Its sound stops when it goes:
 * sent, removed, or its window closed.
 */
export function useSoundPlayer(codes: SoundCodes | null) {
  const owner = useId();
  const mine = useSyncExternalStore(subscribe, () =>
    playing?.owner === owner ? playing : null
  );
  const [at, setAt] = useState(0);
  useEffect(() => () => stopSound(owner), [owner]);
  useEffect(() => {
    if (!mine) {
      setAt(0);
      return;
    }
    let frame = 0;
    const step = () => {
      const elapsed = (context?.currentTime ?? 0) - mine.startedAt;
      setAt(Math.min(mine.duration, mine.from + Math.max(0, elapsed)));
      frame = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(frame);
  }, [mine]);
  return {
    playing: mine !== null,
    at,
    /** Plays from `from` seconds, stopping any other sound. Call it from a click. */
    play: (from = 0, sound = codes) => sound && playSound(sound, owner, from),
    stop: () => stopSound(owner),
  };
}

/**
 * A sound's codes once decoded; null until then, or for a broken one. The
 * same sound in another object, as the cache may hand over, keeps them.
 */
export function useSoundCodes(sound: WireSound | null | undefined) {
  const [decoded, setDecoded] = useState<string | null>(null);
  useEffect(() => {
    if (!sound) return;
    // After this paint: decoding a minute takes a moment.
    const later = setTimeout(() => {
      soundCodes(sound);
      setDecoded(soundKey(sound));
    });
    return () => clearTimeout(later);
  }, [sound]);
  return sound && decoded === soundKey(sound) ? soundCodes(sound) : null;
}
