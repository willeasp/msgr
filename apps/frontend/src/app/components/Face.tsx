import { useMemo } from 'react';
import { identicon, pictureImage } from '../../lib/pixels';
import type { KeptPicture } from '../../lib/picture-wire';
import { useInks } from '../hooks/use-inks';
import { usePicture } from '../hooks/use-picture';
import styles from './Face.module.css';

export interface Person {
  readonly id: string;
  readonly avatar?: KeptPicture | null;
}

/**
 * How someone looks: their profile picture, or else the pattern made from
 * their id, drawn in the theme's colours. A pattern is ink on paper; a
 * picture keeps its tones, so it stays a light sheet on the dark screen.
 * `picture` says which.
 */
export function useFace({ id, avatar }: Person) {
  const bits = usePicture(avatar);
  const inks = useInks();
  const src = useMemo(
    () =>
      bits ? pictureImage(bits, inks.picture) : identicon(id, inks.screen),
    [bits, id, inks]
  );
  return { src, picture: bits !== null };
}

/** Someone's face, 32 px square: on a 2× screen, one pixel of theirs to each. */
export function Face({ person, label }: { person: Person; label?: string }) {
  const { src, picture } = useFace(person);
  return (
    <img
      className={styles.face}
      src={src}
      alt={label ?? ''}
      data-picture={picture || undefined}
      width={32}
      height={32}
    />
  );
}
