import { useEffect, useId, useState, useSyncExternalStore } from 'react';
import type { SoundCodes } from '@msgr/media';
import type { KeptSound } from '../../lib/sound-wire';
import { audio } from '../browser/audio';
import { soundAt, soundNow } from '../data/media';

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
 * A sound's codes once fetched and decoded; null until then, or for a broken
 * one. One already here is ready at once.
 */
export function useSoundCodes(sound: KeptSound | null | undefined) {
  const [loaded, setLoaded] = useState<{
    url: string;
    codes: SoundCodes | null;
  } | null>(null);
  useEffect(() => {
    if (!sound || soundNow(sound) !== undefined) return;
    let current = true;
    void soundAt(sound).then(
      (codes) => current && setLoaded({ url: sound.url, codes })
    );
    return () => {
      current = false;
    };
  }, [sound]);
  if (!sound) return null;
  const now = soundNow(sound);
  if (now !== undefined) return now;
  return loaded?.url === sound.url ? loaded.codes : null;
}
