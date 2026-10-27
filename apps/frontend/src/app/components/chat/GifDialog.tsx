import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { blank, type Bits, type Frames } from '@msgr/media';
import { gql } from '../../../lib/__generated__';
import type { GifsQuery } from '../../../lib/__generated__/graphql';
import { makingLabel } from '../../../lib/gifs';
import { isBlankMovie } from '../../../lib/movie';
import Button from '../../../sacred/components/Button';
import Input from '../../../sacred/components/Input';
import { useModals } from '../../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../../sacred/modules/hotkeys';
import { stillOf } from '../../browser/picture-file';
import {
  movieFromAddress,
  Unmade,
  type Making,
} from '../../browser/video-file';
import { pixelSize, useBitmapCanvas } from '../../hooks/use-bitmap-canvas';
import { useMediaQuery } from '../../hooks/use-media-query';
import { usePhone } from '../../hooks/use-phone';
import { useOnTop } from '../dialogs';
import { DialogButtons, MacDialog } from '../MacDialog';
import { Muted } from '../Muted';
import styles from './GifDialog.module.css';

const GIFS = gql(`
  query Gifs($search: String, $after: String) {
    gifs(search: $search, after: $after) {
      gifs {
        id
        title
        still
        movie
      }
      next
    }
  }
`);

type Gif = NonNullable<GifsQuery['gifs']>['gifs'][number];

/** How long typing pauses before it's searched for: GIPHY allows so many searches an hour. */
const PAUSE_MS = 500;

export interface GifDialogProps {
  /** The window's: "GIF for Ada". */
  title: string;
  /** Takes the finished movie. */
  onDone: (movie: Frames) => void;
}

/** A GIF to choose by: its still, dithered here, square. */
function GifStill({
  gif,
  side,
  disabled,
  onPick,
}: {
  gif: Gif;
  side: number;
  disabled: boolean;
  onPick: (gif: Gif) => void;
}) {
  const [still, setStill] = useState<Bits | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    void stillOf(gif.still, side, controller.signal).then((bits) => {
      if (!controller.signal.aborted) setStill(bits);
    });
    return () => controller.abort();
  }, [gif.still, side]);
  const { ref } = useBitmapCanvas(still ?? blank(side, side));
  return (
    <button
      type="button"
      className={styles.gif}
      aria-label={gif.title || 'GIF'}
      disabled={disabled}
      onClick={() => onPick(gif)}
    >
      <canvas
        ref={ref}
        width={side}
        height={side}
        className={styles.still}
        style={pixelSize({ width: side, height: side })}
      />
    </button>
  );
}

/**
 * Finds a GIF on GIPHY, through this server, and makes it a movie on this
 * device, as Movie… makes one of a video: from its start, up to six seconds,
 * in black and white. Trending GIFs until something's typed.
 */
export function GifDialog({ title, onDone }: GifDialogProps) {
  const { close } = useModals();
  const onTop = useOnTop();
  const isPhone = usePhone();
  // On a phone, the keyboard waits for a tap: the trending GIFs show first.
  const hasMouse = useMediaQuery('(pointer: fine)');
  // Rows of four at 2×; on a phone, of three at 1× on most screens.
  const side = isPhone ? 84 : 64;

  const [typed, setTyped] = useState('');
  const [search, setSearch] = useState('');
  useEffect(() => {
    const words = typed.trim();
    if (words === search) return;
    const timer = setTimeout(() => setSearch(words), words ? PAUSE_MS : 0);
    return () => clearTimeout(timer);
  }, [typed, search]);

  const { data, loading, error, fetchMore, refetch } = useQuery(GIFS, {
    variables: { search: search || null },
    // A search already made this visit isn't made again, nor its pages
    // (lib/cache.ts keeps them, and catchUp leaves them be).
    fetchPolicy: 'cache-first',
  });
  // This search's GIFs alone: while it's on its way, it's said so.
  const page = data?.gifs;
  // More, asked for this search: the next page joins only the search it was
  // asked for, however the field changes meanwhile (lib/cache.ts).
  const [more, setMore] = useState<{
    readonly search: string;
    readonly failed: boolean;
  } | null>(null);
  const moreNow = more?.search === search ? more : null;
  const showMore = (after: string) => {
    const asked = search;
    const settled = (next: typeof more) =>
      setMore((now) => (now?.search === asked ? next : now));
    setMore({ search: asked, failed: false });
    fetchMore({ variables: { after } }).then(
      () => settled(null),
      () => settled({ search: asked, failed: true })
    );
  };

  const video = useRef<HTMLVideoElement>(null);
  const [making, setMaking] = useState<Making | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useEffect(() => () => abort.current?.abort(), []);
  const make = (gif: Gif) => {
    const v = video.current;
    if (!v || making) return;
    // Played inside the tap, iOS lets it play later, once its GIF is in,
    // even in Low Power Mode; with nothing to play yet, this alone fails.
    void v.play().catch(() => undefined);
    setProblem(null);
    const controller = new AbortController();
    abort.current = controller;
    void movieFromAddress(v, gif.movie, controller.signal, setMaking)
      .then((movie) => {
        if (!movie) return;
        if (isBlankMovie(movie)) {
          setProblem('That GIF comes out blank: nothing in it is dark.');
          return;
        }
        onDone(movie);
        close();
      })
      .catch((failure: unknown) =>
        setProblem(
          failure instanceof Unmade
            ? failure.message
            : 'That GIF couldn’t be made into a movie. Try another.'
        )
      )
      .finally(() => {
        if (abort.current === controller) abort.current = null;
        setMaking(null);
      });
  };
  const stop = () => abort.current?.abort();

  useHotkeys('Escape', () => (making ? stop() : close()), {
    enabled: onTop,
    enableOnFormTags: true,
  });

  return (
    // A phone's dialog is as wide as the screen allows, for as many as fit.
    <MacDialog title={title} modal wide={!isPhone}>
      <form
        className={styles.search}
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(typed.trim());
        }}
      >
        <Input
          label="Search"
          name="search"
          placeholder="GIPHY"
          autoComplete="off"
          enterKeyHint="search"
          maxLength={50}
          autoFocus={hasMouse}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
        />
      </form>
      <div className={styles.results}>
        <div
          className={styles.grid}
          role="group"
          aria-label={search ? `GIFs for ${search}` : 'Trending GIFs'}
          aria-busy={loading}
        >
          {page?.gifs.map((gif) => (
            <GifStill
              key={gif.id}
              gif={gif}
              side={side}
              disabled={!!making}
              onPick={make}
            />
          ))}
          {page?.next && (
            <div className={styles.more}>
              <Button
                theme="SECONDARY"
                isDisabled={(!!moreNow && !moreNow.failed) || !!making}
                onClick={() => page.next && showMore(page.next)}
              >
                {moreNow && !moreNow.failed ? 'Fetching…' : 'More GIFs'}
              </Button>
              {moreNow?.failed && <Muted>Those couldn’t be fetched.</Muted>}
            </div>
          )}
          {!page &&
            (error ? (
              <div className={styles.status} role="alert">
                <p>{error.message}</p>
                <Button theme="SECONDARY" onClick={() => void refetch()}>
                  Try Again
                </Button>
              </div>
            ) : loading ? (
              <Muted>{search ? 'Searching GIPHY…' : 'Asking GIPHY…'}</Muted>
            ) : data?.gifs === null ? (
              <Muted>GIFs are off on this server.</Muted>
            ) : null)}
          {page?.gifs.length === 0 && (
            <Muted>
              {search
                ? `No GIFs for “${search}”.`
                : 'Nothing’s trending on GIPHY just now.'}
            </Muted>
          )}
        </div>
        {/* What's being made, read from the GIF under a dithered cover:
            browsers read the frames of a video they show. */}
        <div
          className={making ? styles.making : styles.idle}
          aria-live="polite"
        >
          <video
            ref={video}
            muted
            playsInline
            preload="auto"
            className={styles.video}
            aria-hidden
          />
          {making && (
            <p className={styles.busy}>
              <span>{makingLabel(making)}</span>
            </p>
          )}
        </div>
      </div>
      {problem && (
        <p role="alert" className={styles.problem}>
          {problem}
        </p>
      )}
      <div className={styles.footer}>
        <span className={styles.giphy}>Powered by GIPHY</span>
        <DialogButtons>
          {making ? (
            <>
              <Button theme="SECONDARY" onClick={stop}>
                Stop
              </Button>
              <Button isDisabled>Making…</Button>
            </>
          ) : (
            <Button theme="SECONDARY" onClick={() => close()}>
              Cancel
            </Button>
          )}
        </DialogButtons>
      </div>
    </MacDialog>
  );
}
