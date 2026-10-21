import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import type { SoundCodes } from '@msgr/media';
import { soundCodes, soundKey, type WireSound } from '../../lib/sound-wire';
import { audio } from '../browser/audio';

/**
 * A player for one sound, on the page's one audio (`app/browser/audio.ts`): whether
 * it's the one playing, and how far in, in seconds, updated every frame
 * while it plays. Starting it stops any other sound. Its sound stops when it
 * goes: sent, removed, or its window closed.
 */
export function useSoundPlayer(codes: SoundCodes | null) {
  const owner = useId();
  const state = useSyncExternalStore(audio.subscribe, audio.state);
  const mine = state.kind === 'playing' && state.owner === owner;
  const [at, setAt] = useState(0);
  useEffect(() => () => audio.stop(owner), [owner]);
  useEffect(() => {
    if (!mine) {
      setAt(0);
      return;
    }
    let frame = 0;
    const step = () => {
      setAt(audio.position());
      frame = requestAnimationFrame(step);
    };
    step();
    return () => cancelAnimationFrame(frame);
  }, [mine, state]);
  return {
    playing: mine,
    at,
    /** Plays from `from` seconds, or another sound in its place. Call it from a click. */
    play: (from = 0, sound = codes) => {
      if (sound) audio.play(owner, sound, from);
    },
    stop: () => audio.stop(owner),
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
