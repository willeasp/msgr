import { Fragment, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { arrivedSince, placeMessages } from '../../../lib/runs';
import { formatDay } from '../../../lib/time';
import type { KeptMovie } from '../../../lib/movie-wire';
import type { KeptPicture } from '../../../lib/picture-wire';
import { GET_CHAT_MESSAGES, HISTORY_PAGE } from '../../data/chats';
import { useClock } from '../../hooks/use-clock';
import { useReading } from '../../hooks/use-reading';
import { DOWN } from '../icons';
import { LoadingState } from '../LoadingState';
import { Muted } from '../Muted';
import { PixelIcon } from '../PixelIcon';
import { Wristwatch } from '../Wristwatch';
import { MessageBubble } from './MessageBubble';
import styles from './MessageList.module.css';

interface MessageListProps {
  chatId: string;
  currentUserId: string | undefined;
  /** Name each run's sender: in groups and channels, not direct chats. */
  showNames: boolean;
  onDrawOnIt?: (picture: KeptPicture) => void;
  onDrawOnMovie?: (movie: KeptMovie) => void;
  /** Opens Get Info on a message: a click on it, or a finger held on it. */
  onGetInfo?: (messageId: string) => void;
}

/** Within this of the end is at it: opening on the newest leaves the padding below it out of view. */
const NEAR_END = 32;

const isAtEnd = (element: HTMLElement) =>
  element.scrollHeight - element.scrollTop - element.clientHeight < NEAR_END;

/**
 * A chat's history, newest at the bottom, each day headed by its name and
 * each run of one sender's messages showing their face, name and time once
 * (lib/runs.ts). It opens at the end and stays there as messages arrive,
 * pictures load and the window resizes. Scrolled up to read, it stays put
 * and offers what arrived instead, unless it's the viewer's own. Reaching
 * the top asks for the page before, and keeps the place.
 */
export function MessageList({
  chatId,
  currentUserId,
  showNames,
  onDrawOnIt,
  onDrawOnMovie,
  onGetInfo,
}: MessageListProps) {
  // The page's feed appends live messages; opening the chat also refreshes
  // it, catching anything sent while this tab was offline or asleep.
  const {
    data,
    loading: messagesLoading,
    fetchMore,
  } = useQuery(GET_CHAT_MESSAGES, {
    variables: { chatId },
    fetchPolicy: 'cache-and-network',
  });
  const messages = data?.messages ?? [];
  const newestId = messages.at(-1)?.id;
  const oldestId = messages[0]?.id;
  const newestIsMine = messages.at(-1)?.sender.id === currentUserId;

  // Whatever's on a visible screen has been read.
  useReading(chatId, newestId);

  const log = useRef<HTMLDivElement>(null);
  const content = useRef<HTMLDivElement>(null);
  const top = useRef<HTMLDivElement>(null);
  // Whether the viewer was at the end when they last scrolled, which the
  // history keeps to as it grows; and the newest they saw there.
  const [atEnd, setAtEnd] = useState(true);
  const wasAtEnd = useRef(true);
  const [seen, setSeen] = useState<string>();
  // What's laid out, and where the viewer was before a page of earlier
  // messages arrived above.
  const laidOut = useRef<{ newest?: string; oldest?: string }>({});
  const before = useRef<{ height: number; top: number } | null>(null);
  const [earlier, setEarlier] = useState<'idle' | 'loading' | 'failed'>(
    'idle'
  );
  // The chat's first message, once a page said nothing came before it: a
  // fact about that message, so it holds should the history start again.
  const [first, setFirst] = useState<string>();
  const hasMessages = messages.length > 0;
  const hasEarlier = messages.length >= HISTORY_PAGE && first !== oldestId;

  useEffect(() => {
    const element = log.current;
    if (!element) return;
    const scrolled = () => {
      const end = isAtEnd(element);
      wasAtEnd.current = end;
      setAtEnd(end);
      if (end) setSeen(laidOut.current.newest);
      // Back up to it after failing: try again.
      setEarlier((state) => (state === 'failed' ? 'idle' : state));
    };
    // At the end, it stays there while it or what's in it resizes: a
    // picture loading, a phone's keyboard coming up under it.
    const pin = new ResizeObserver(() => {
      if (wasAtEnd.current) element.scrollTop = element.scrollHeight;
    });
    element.addEventListener('scroll', scrolled, { passive: true });
    pin.observe(element);
    if (content.current) pin.observe(content.current);
    return () => {
      element.removeEventListener('scroll', scrolled);
      pin.disconnect();
    };
  }, [hasMessages]);

  useLayoutEffect(() => {
    const element = log.current;
    if (!element || !newestId) return;
    const was = laidOut.current;
    laidOut.current = { newest: newestId, oldest: oldestId };
    // Opening: at the newest.
    if (was.newest === undefined) {
      element.scrollTop = element.scrollHeight;
      setSeen(newestId);
      return;
    }
    // Earlier ones above: what was in view stays where it was.
    if (oldestId !== was.oldest && before.current) {
      element.scrollTop =
        before.current.top + element.scrollHeight - before.current.height;
      before.current = null;
    }
    // Something new: followed at the end, or when it's the viewer's own.
    if (newestId !== was.newest && (wasAtEnd.current || newestIsMine)) {
      wasAtEnd.current = true;
      setAtEnd(true);
      setSeen(newestId);
      element.scrollTo({ top: element.scrollHeight, behavior: 'smooth' });
    }
  }, [newestId, oldestId, newestIsMine]);

  const canLoadEarlier = earlier === 'idle' && hasEarlier;
  useEffect(() => {
    const element = log.current;
    const sentinel = top.current;
    if (!element || !sentinel || !canLoadEarlier || !oldestId) return;
    const watch = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting || laidOut.current.newest === undefined) {
          return;
        }
        watch.disconnect();
        before.current = {
          height: element.scrollHeight,
          top: element.scrollTop,
        };
        setEarlier('loading');
        fetchMore({ variables: { chatId, before: oldestId } }).then(
          (result) => {
            const page = result.data?.messages ?? [];
            if (page.length === 0) before.current = null;
            if (page.length < HISTORY_PAGE) setFirst(page[0]?.id ?? oldestId);
            setEarlier('idle');
          },
          () => {
            // Asked again once the viewer scrolls back up to it.
            before.current = null;
            setEarlier('failed');
          }
        );
      },
      { root: element }
    );
    watch.observe(sentinel);
    return () => watch.disconnect();
  }, [canLoadEarlier, oldestId, chatId, fetchMore]);

  if (messagesLoading && !data) {
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

  const newer = atEnd ? 0 : arrivedSince(messages, seen, currentUserId);

  return (
    <div className={styles.frame}>
      <div ref={log} className={styles.root} role="log" aria-label="Messages">
        <div ref={content}>
          {hasEarlier && (
            <div ref={top} className={styles.earlier}>
              {earlier === 'loading' && (
                <>
                  <Wristwatch />
                  <span>Loading earlier messages…</span>
                </>
              )}
            </div>
          )}
          {placeMessages(messages).map(({ message, startsDay, startsRun }) => (
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
          ))}
        </div>
      </div>
      {newer > 0 && (
        <button
          type="button"
          className={styles.newer}
          onClick={() =>
            log.current?.scrollTo({
              top: log.current.scrollHeight,
              behavior: 'smooth',
            })
          }
        >
          {newer === 1 ? '1 New Message' : `${newer} New Messages`}
          <PixelIcon bitmap={DOWN} scale={1} />
        </button>
      )}
    </div>
  );
}

/** A day's name on a ruled line, above its first message; "Today" turns "Yesterday" at midnight. */
function DayLine({ date }: { date: string }) {
  const now = useClock();
  return (
    <h3 className={styles.day}>
      <span>{formatDay(date, now)}</span>
    </h3>
  );
}
