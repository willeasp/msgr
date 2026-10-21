import { useRef } from 'react';
import type { WireSound } from '../../../lib/sound-wire';
import { useOnScreen } from '../../hooks/use-movie';
import { useSoundCodes } from '../../hooks/use-sound';
import { SoundPlayer } from './SoundPlayer';

/**
 * A sound from the chat. It decodes once it first nears the screen, so a
 * chat of many sounds opens without waiting for them all.
 */
export function MessageSound({ sound }: { sound: WireSound }) {
  const ref = useRef<HTMLSpanElement>(null);
  const onScreen = useOnScreen(ref);
  const codes = useSoundCodes(onScreen.ever ? sound : null);
  return (
    // Its waveform's clicks play from there, rather than opening Get Info.
    <span ref={ref} role="group" aria-label="Sound" data-own-clicks>
      <SoundPlayer frames={sound.frames} codes={codes} />
    </span>
  );
}
