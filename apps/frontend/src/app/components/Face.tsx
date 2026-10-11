import { useMemo } from 'react';
import { identicon, pictureImage } from '../../lib/pixels';
import type { WirePicture } from '../../lib/picture-wire';
import { usePicture } from '../hooks/use-picture';
import styles from './Face.module.css';

export interface Person {
  readonly id: string;
  readonly avatar?: WirePicture | null;
}

/**
 * How someone looks: their profile picture, or else the pattern made from
 * their id. `picture` says which, since only patterns follow the dark screen.
 */
export function useFace({ id, avatar }: Person) {
  const bits = usePicture(avatar);
  const src = useMemo(
    () => (bits ? pictureImage(bits) : identicon(id)),
    [bits, id]
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
