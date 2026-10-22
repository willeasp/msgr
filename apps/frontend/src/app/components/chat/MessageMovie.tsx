import { useEffect, useMemo, useState } from 'react';
import { blank, frameOf } from '@msgr/media';
import type { KeptMovie } from '../../../lib/movie-wire';
import { pixelSize, useBitmapCanvas } from '../../hooks/use-bitmap-canvas';
import { useMovie, useMovieTick, useOnScreen } from '../../hooks/use-movie';
import styles from './MessagePicture.module.css';

/**
 * A movie from the chat, looping like a GIF, in the theme's ink and paper,
 * exactly as a picture shows; blank until decoded. Nothing to press. It
 * decodes once it first nears the screen, and steps only while it's there,
 * so a chat of many movies opens without waiting for them all.
 */
export function MessageMovie({ movie }: { movie: KeptMovie }) {
  const empty = useMemo(
    () => blank(movie.width, movie.height),
    [movie.width, movie.height]
  );
  const [shown, setShown] = useState(empty);
  const { ref } = useBitmapCanvas(shown);
  const onScreen = useOnScreen(ref);
  const frames = useMovie(onScreen.ever ? movie : null);
  const tick = useMovieTick(onScreen.now);
  useEffect(() => {
    setShown(frames ? frameOf(frames, tick % frames.count) : empty);
  }, [frames, tick, empty]);

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
