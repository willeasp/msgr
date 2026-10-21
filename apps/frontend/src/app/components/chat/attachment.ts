import type { Bits, Frames, SoundCodes } from '@msgr/bitmap';
import type { Drawing } from '../../../lib/movie';

/**
 * What goes with the next message: a picture, a movie with what's been
 * drawn over it so far, drawn into its frames only when it's sent, or a
 * sound.
 */
export type Attachment =
  | { readonly kind: 'picture'; readonly bits: Bits }
  | {
      readonly kind: 'movie';
      readonly movie: Frames;
      readonly drawing: Drawing | null;
    }
  | { readonly kind: 'sound'; readonly codes: SoundCodes };
