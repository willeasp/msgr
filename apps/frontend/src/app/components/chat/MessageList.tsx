import {
  Fragment,
  memo,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useQuery } from '@apollo/client/react';
import type { GetChatMessagesQuery } from '../../../lib/__generated__/graphql';
import {
  arrivedSince,
  firstFrom,
  hasEarlier,
  HISTORY_PAGE,
} from '../../../lib/history';
import { placeMessages } from '../../../lib/runs';
import { formatDay } from '../../../lib/time';
import type { KeptMovie } from '../../../lib/movie-wire';
import type { KeptPicture } from '../../../lib/picture-wire';
import Button from '../../../sacred/components/Button';
import { GET_CHAT_MESSAGES } from '../../data/chats';
import { useClock } from '../../hooks/use-clock';
import { useReading } from '../../hooks/use-reading';
import { useAwayFromNewest } from '../../hooks/use-signed-in';
import { DOWN } from '../icons';
import { LoadingState } from '../LoadingState';
import { Muted } from '../Muted';
import { PixelIcon } from '../PixelIcon';
import { Wristwatch } from '../Wristwatch';
import { MessageBubble } from './MessageBubble';
import styles from './MessageList.module.css';

type Message = GetChatMessagesQuery['messages'][number];

interface MessageListProps {
  chatId: string;
  currentUserId: string | undefined;
  /** Name each run's sender: in groups and channels, not direct chats. */
  showNames: boolean;
  /** How many messages the viewer has sent from this window: each takes the history to its newest. */
  sends: number;
  onDrawOnIt?: (picture: KeptPicture) => void;
  onDrawOnMovie?: (movie: KeptMovie) => void;
  /** Opens Get Info on a message: a click on it, or a finger held on it. */
  onGetInfo?: (messageId: string) => void;
}

/**
 * A chat's history, newest at the bottom: loading, empty, or the messages.
 * The page's feed appends live ones; opening the chat also refreshes it,
 * catching anything sent while this tab was offline or asleep.
 */
export function MessageList(props: MessageListProps) {
  const { chatId } = props;
  const { data, loading, fetchMore } = useQuery(GET_CHAT_MESSAGES, {
    variables: { chatId, limit: HISTORY_PAGE },
    fetchPolicy: 'cache-and-network',
  });
  const messages = data?.messages ?? [];

  if (loading && !data) {
    return (
      <div className={styles.root}>
        <LoadingState label="Loading messages" />
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className={styles.root}>
        <div className={styles.empty}>
          <Muted>No messages yet. Say hello.</Muted>
        </div>
      </div>
    );
  }

  return (
    <History
      {...props}
      messages={messages}
      loadEarlier={(before) =>
        fetchMore({ variables: { chatId, before, limit: HISTORY_PAGE } }).then(
          ({ data }) => {
            // An error isn't an empty page, which would end the history.
            if (!data) throw new Error('No page of earlier messages');
            return data.messages;
          }
        )
      }
    />
  );
}

/** Within this of the end is at it: opening on the newest leaves the padding below it out of view. */
const NEAR_END = 32;

const isAtEnd = (element: HTMLElement) =>
  element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_END;

/** A message the viewer reads by, and how far below the history's top it is. */
interface Anchor {
  readonly node: Element;
  readonly top: number;
}

const topIn = (element: HTMLElement, node: Element) =>
  node.getBoundingClientRect().top - element.getBoundingClientRect().top;

/** The first message at least partly in view: what the viewer reads by. */
function readingBy(element: HTMLElement, content: HTMLElement): Anchor | null {
  const viewTop = element.getBoundingClientRect().top;
  const items = content.querySelectorAll('[data-message]');
  let low = 0;
  let high = items.length - 1;
  while (low < high) {
    const middle = (low + high) >> 1;
    const item = items[middle];
    if (item && item.getBoundingClientRect().bottom > viewTop) high = middle;
    else low = middle + 1;
  }
  const node = items[low];
  return node
    ? { node, top: node.getBoundingClientRect().top - viewTop }
    : null;
}

/**
 * Where the viewer is in a history: at its newest, which it keeps to as the
 * history grows, or reading further up, by a message it keeps in place
 * whatever grows or arrives above or below it. The browser's own scroll
 * anchoring is off (Safari has none), so it's the same everywhere. It
 * follows the scrolling, which renders nothing, and says when the viewer
 * leaves the end (with the newest then) and comes back to it (null).
 */
function placeIn(away: (newestSeen: string | null) => void) {
  let log: HTMLElement | null = null;
  let atEnd = true;
  let anchor: Anchor | null = null;
  let newest: string | undefined;
  // Where it last scrolled to: only the viewer scrolling up leaves the end.
  let lastTop = 0;

  const toEnd = (element: HTMLElement) => {
    element.scrollTop = element.scrollHeight;
    lastTop = element.scrollTop;
  };
  const toNewest = () => {
    if (!log) return;
    atEnd = true;
    anchor = null;
    away(null);
    toEnd(log);
  };
  // At the end, still there; away from it, the message read by where it
  // was; gone (the history started again, events missed), as if opened.
  const keep = () => {
    if (!log) return;
    if (atEnd) return toEnd(log);
    if (!anchor) return;
    if (!anchor.node.isConnected) return toNewest();
    const moved = topIn(log, anchor.node) - anchor.top;
    if (moved !== 0) log.scrollTop += moved;
  };

  return {
    /** Follows this history's scrolling and resizing, until the cleanup it returns. */
    watch(element: HTMLElement, content: HTMLElement) {
      log = element;
      const scrolled = () => {
        const up = element.scrollTop < lastTop;
        lastTop = element.scrollTop;
        // Something that grew below, seen by this scroll's event before
        // the resize is, hasn't moved the viewer from the end.
        if (atEnd && !up) {
          if (!isAtEnd(element)) toEnd(element);
          return;
        }
        atEnd = isAtEnd(element);
        anchor = atEnd ? null : readingBy(element, content);
        away(atEnd ? null : newest ?? null);
      };
      // A picture loading, a link's card, a page above, a phone's keyboard.
      const resized = new ResizeObserver(keep);
      element.addEventListener('scroll', scrolled, { passive: true });
      resized.observe(element);
      resized.observe(content);
      return () => {
        element.removeEventListener('scroll', scrolled);
        resized.disconnect();
        log = null;
      };
    },
    toNewest,
    /** The history laid out anew, `newestId` its newest. */
    laidOut(newestId: string | undefined) {
      newest = newestId;
      keep();
    },
  };
}

/**
 * The messages, each day headed by its name and each run of one sender's
 * showing their face, name and time once (lib/runs.ts). It opens at the
 * newest and stays there as messages arrive, pictures load and the window
 * resizes. Scrolled up to read, it keeps the viewer's place (`placeIn`), and
 * what arrives waits below, unread, with a button to it; a send from this
 * window goes to it. Reaching the top asks for the page before.
 */
function History({
  chatId,
  currentUserId,
  showNames,
  sends,
  messages,
  loadEarlier,
  onDrawOnIt,
  onDrawOnMovie,
  onGetInfo,
}: MessageListProps & {
  messages: readonly Message[];
  loadEarlier: (before: string) => Promise<readonly Message[]>;
}) {
  const newest = messages[messages.length - 1];
  const newestId = newest?.id;
  const oldestId = messages[0]?.id;

  const log = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  // Away from the end: the newest message when the viewer left it.
  const [away, setAway] = useState<string | null>(null);
  const [place] = useState(() =>
    placeIn((seen) => setAway((was) => (seen === null ? null : was ?? seen)))
  );
  // Earlier messages: none asked for, the page before a message being
  // fetched, or a fetch that failed, which Try Again asks for again.
  const [earlier, setEarlier] = useState<
    'idle' | 'failed' | { readonly before: string }
  >('idle');
  // The chat's first message, once a page said nothing came before it: a
  // fact about that message, so it holds should the history start again.
  const [first, setFirst] = useState<string>();
  const more = hasEarlier(messages, first);
  // What it opened with and what arrives since are read out as they come;
  // earlier pages, above them, aren't.
  const [openedFrom] = useState(oldestId);

  // Read up to what the viewer has seen: away from the end, what arrives
  // waits below, unread, and counts in the chat list.
  useAwayFromNewest(chatId, away !== null);
  useReading(chatId, away ?? newestId, away === null);

  // Before the two below, which scroll it.
  useLayoutEffect(() => {
    if (!log.current || !content.current) return;
    return place.watch(log.current, content.current);
  }, [place]);

  // Opening, and each send from this window: at the newest.
  useLayoutEffect(() => place.toNewest(), [sends, place]);

  // Something new, a page earlier, the row asking for it: shown at the end;
  // away from it, the place kept, before anything can see it move.
  useLayoutEffect(
    () => place.laidOut(newestId),
    [newestId, oldestId, more, earlier, place]
  );

  // Reaching the top asks for the page before.
  const canAsk = earlier === 'idle' && more;
  useEffect(() => {
    const element = log.current;
    const sentinel = top.current;
    if (!element || !sentinel || !canAsk || !oldestId) return;
    const watch = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        watch.disconnect();
        setEarlier({ before: oldestId });
      },
      { root: element }
    );
    watch.observe(sentinel);
    return () => watch.disconnect();
  }, [canAsk, oldestId]);

  // Fetches the page asked for; only this asking hears how it went.
  useEffect(() => {
    if (typeof earlier !== 'object') return;
    let asking = true;
    loadEarlier(earlier.before).then(
      (page) => {
        if (!asking) return;
        const found = firstFrom(page, earlier.before);
        if (found) setFirst(found);
        setEarlier('idle');
      },
      () => {
        if (asking) setEarlier('failed');
      }
    );
    return () => {
      asking = false;
    };
  }, [earlier, loadEarlier]);

  const newer = away === null ? 0 : arrivedSince(messages, away, currentUserId);
  const placed = placeMessages(messages).map(
    ({ message, startsDay, startsRun }) => (
      <Fragment key={message.id}>
        {startsDay && <DayLine date={message.createdAt} />}
        <MessageBubble
          message={message}
          isCurrentUser={message.sender.id === currentUserId}
          showMeta={startsRun}
          showName={showNames}
          onDrawOnIt={onDrawOnIt}
          onDrawOnMovie={onDrawOnMovie}
          onGetInfo={onGetInfo}
        />
      </Fragment>
    )
  );
  const silent = Math.max(
    0,
    messages.findIndex(({ id }) => id === openedFrom)
  );

  return (
    <div className={styles.frame}>
      {/* The log reads out only what arrives, in the polite part below: the
          pages of earlier messages above it come silently. */}
      <div
        ref={log}
        className={styles.root}
        role="log"
        aria-label="Messages"
        aria-live="off"
        tabIndex={0}
      >
        <div ref={content}>
          {more && (
            <div ref={top} className={styles.earlier}>
              {typeof earlier === 'object' && (
                <>
                  <Wristwatch />
                  <span>Loading earlier messages…</span>
                </>
              )}
              {earlier === 'failed' && (
                <>
                  <span>Couldn’t load earlier messages.</span>
                  <Button
                    onClick={() => oldestId && setEarlier({ before: oldestId })}
                  >
                    Try Again
                  </Button>
                </>
              )}
            </div>
          )}
          <div>{placed.slice(0, silent)}</div>
          <div aria-live="polite" aria-relevant="additions">
            {placed.slice(silent)}
          </div>
        </div>
      </div>
      {newer > 0 && (
        <button
          type="button"
          className={styles.newer}
          onClick={() => {
            place.toNewest();
            log.current?.focus({ preventScroll: true });
          }}
        >
          {newer === 1 ? '1 New Message' : `${newer} New Messages`}
          <PixelIcon bitmap={DOWN} scale={1} />
        </button>
      )}
    </div>
  );
}

/** A day's name on a ruled line, above its first message; "Today" turns "Yesterday" at midnight. */
const DayLine = memo(function DayLine({ date }: { date: string }) {
  const now = useClock();
  return (
    <h3 className={styles.day}>
      <span>{formatDay(date, now)}</span>
    </h3>
  );
});
