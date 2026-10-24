import { useMovieTick } from '../hooks/use-movie';
import { watchAt } from './icons';
import { PixelIcon } from './PixelIcon';

/**
 * The classic wristwatch, for something under way: its hand goes round on
 * the movies' timer, and keeps still for anyone who asked for less motion.
 */
export function Wristwatch() {
  return <PixelIcon bitmap={watchAt(useMovieTick(true))} scale={1} />;
}
