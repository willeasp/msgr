import { useMemo } from 'react';
import { blank, frameOf } from '@msgr/bitmap';
import type { WireMovie } from '../../../lib/movie-wire';
import { pixelSize, useBitmapCanvas } from '../../hooks/use-bitmap-canvas';
import { useMovie, useMovieTick } from '../../hooks/use-movie';
import styles from './MessagePicture.module.css';

/**
 * A movie from the chat, looping like a GIF, in the theme's ink and paper,
 * exactly as a picture shows; blank until decoded. Nothing to press.
 */
export function MessageMovie({ movie }: { movie: WireMovie }) {
  const empty = useMemo(
    () => blank(movie.width, movie.height),
    [movie.width, movie.height]
  );
  const frames = useMovie(movie);
  const tick = useMovieTick();
  const shown = useMemo(
    () => (frames ? frameOf(frames, tick % frames.count) : empty),
    [frames, tick, empty]
  );
  const { ref } = useBitmapCanvas(shown);

  return (
    <canvas
      ref={ref}
      width={movie.width}
      height={movie.height}
      role="img"
      aria-label="Movie"
      className={styles.picture}
      style={pixelSize(movie)}
    />
  );
}
