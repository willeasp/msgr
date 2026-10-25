import type { Bits, Frames, SoundCodes } from '@msgr/media';
import { drawnOver, type Drawing } from './movie';

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

/** What goes with a message as it's sent: a movie with what's drawn over it drawn into every frame. */
export type Made =
  | { readonly kind: 'picture'; readonly bits: Bits }
  | { readonly kind: 'movie'; readonly frames: Frames }
  | { readonly kind: 'sound'; readonly codes: SoundCodes };

/** What an attachment is made into when it's sent; nothing for none. */
export function madeOf(attachment: Attachment | null): Made | null {
  switch (attachment?.kind) {
    case undefined:
      return null;
    case 'picture':
      return { kind: 'picture', bits: attachment.bits };
    case 'movie':
      return {
        kind: 'movie',
        frames: attachment.drawing
          ? drawnOver(attachment.movie, attachment.drawing)
          : attachment.movie,
      };
    case 'sound':
      return { kind: 'sound', codes: attachment.codes };
  }
}
