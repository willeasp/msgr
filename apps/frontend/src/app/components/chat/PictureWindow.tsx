import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { blank, frameOf } from '@msgr/media';
import { fullSize, type Size } from '../../../lib/full-size';
import type { KeptMovie } from '../../../lib/movie-wire';
import type { KeptPicture } from '../../../lib/picture-wire';
import { useModals } from '../../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../../sacred/modules/hotkeys';
import { useBitmapCanvas } from '../../hooks/use-bitmap-canvas';
import { useMovie, useMovieSteps } from '../../hooks/use-movie';
import { usePhone } from '../../hooks/use-phone';
import { usePicture } from '../../hooks/use-picture';
import { useOnTop } from '../dialogs';
import { MacWindow } from '../MacWindow';
import styles from './PictureWindow.module.css';

/** What a picture window shows: a message's picture, or its movie. */
export type Shown =
  | { readonly kind: 'picture'; readonly picture: KeptPicture }
  | { readonly kind: 'movie'; readonly movie: KeptMovie };

/**
 * A message's picture or movie, full screen: in a window of its own on the
 * desktop's pattern, as large as fits (lib/full-size.ts). On a phone the
 * window fills the screen, the pattern around the picture. A click or a tap
 * anywhere closes it, as do its close box (Back, on a phone) and Escape.
 */
export function PictureWindow({
  title,
  shown,
}: {
  title: string;
  shown: Shown;
}) {
  const { close } = useModals();
  const onTop = useOnTop();
  const isPhone = usePhone();
  // A click on the close box is a click on the window too: close once.
  const closed = useRef(false);
  const shut = () => {
    if (closed.current) return;
    closed.current = true;
    close();
  };
  useHotkeys('Escape', shut, { enabled: onTop, enableOnFormTags: true });

  const backdrop = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLDivElement>(null);
  const room = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<Size | null>(null);
  const natural = shown.kind === 'picture' ? shown.picture : shown.movie;
  const { width, height } = natural;

  // As large as the screen allows, once it's laid out: the room is the
  // screen's less the window's own parts (its title bar, its edges), which
  // is what's left around the picture's place in it.
  useLayoutEffect(() => {
    const parts = [backdrop.current, frame.current, room.current];
    const [screen, around, place] = parts;
    if (!screen || !around || !place) return;
    const measure = () => {
      const space = contentBox(screen);
      const inside = contentBox(place);
      const next = fullSize(
        { width, height },
        {
          width: space.width - (around.offsetWidth - inside.width),
          height: space.height - (around.offsetHeight - inside.height),
        },
        window.devicePixelRatio || 1
      );
      setSize((was) =>
        was?.width === next.width && was.height === next.height ? was : next
      );
    };
    const watch = new ResizeObserver(measure);
    for (const part of parts) if (part) watch.observe(part);
    return () => watch.disconnect();
  }, [width, height]);

  // The keyboard comes here, and goes back to the picture after.
  useEffect(() => {
    const opener = document.activeElement;
    room.current?.focus({ preventScroll: true });
    return () => {
      if (opener instanceof HTMLElement) opener.focus({ preventScroll: true });
    };
  }, []);

  return (
    <div
      ref={backdrop}
      className={`${styles.screen} ${isPhone ? styles.phone : styles.desktop}`}
      onClick={shut}
    >
      <div ref={frame} className={styles.frame}>
        <MacWindow title={title} onClose={shut} fill={isPhone} modal>
          <div
            ref={room}
            className={isPhone ? styles.pattern : styles.paper}
            tabIndex={-1}
          >
            {shown.kind === 'picture' ? (
              <FullPicture picture={shown.picture} size={size} />
            ) : (
              <FullMovie movie={shown.movie} size={size} />
            )}
          </div>
        </MacWindow>
      </div>
    </div>
  );
}

/** An element's size inside its padding. */
function contentBox(element: HTMLElement): Size {
  const style = getComputedStyle(element);
  return {
    width:
      element.clientWidth -
      parseFloat(style.paddingLeft) -
      parseFloat(style.paddingRight),
    height:
      element.clientHeight -
      parseFloat(style.paddingTop) -
      parseFloat(style.paddingBottom),
  };
}

/** Its CSS size, once measured; until then its own, unseen. */
const sized = (size: Size | null) =>
  size
    ? { width: `${size.width}px`, height: `${size.height}px` }
    : { visibility: 'hidden' as const };

function FullPicture({
  picture,
  size,
}: {
  picture: KeptPicture;
  size: Size | null;
}) {
  const [empty] = useState(() => blank(picture.width, picture.height));
  const ref = useRef<HTMLCanvasElement>(null);
  useBitmapCanvas(usePicture(picture) ?? empty, ref);
  return (
    <canvas
      ref={ref}
      width={picture.width}
      height={picture.height}
      role="img"
      aria-label="Picture"
      className={styles.canvas}
      style={sized(size)}
    />
  );
}

/** A movie loops as in the chat, on the page's one timer, still for anyone who asked for less motion. */
function FullMovie({ movie, size }: { movie: KeptMovie; size: Size | null }) {
  const [empty] = useState(() => blank(movie.width, movie.height));
  const ref = useRef<HTMLCanvasElement>(null);
  const frames = useMovie(movie);
  useMovieSteps(
    ref,
    (tick) => (frames ? frameOf(frames, tick % frames.count) : empty),
    frames !== null
  );
  return (
    <canvas
      ref={ref}
      width={movie.width}
      height={movie.height}
      role="img"
      aria-label="Movie"
      className={styles.canvas}
      style={sized(size)}
    />
  );
}
