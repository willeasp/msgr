import { useEffect, useRef } from 'react';
import { useQuery } from '@apollo/client/react';
import { gql } from '../../../lib/__generated__';
import { useReading } from '../../hooks/use-reading';
import { LoadingState } from '../LoadingState';
import { Muted } from '../Muted';
import type { WireMovie } from '../../../lib/movie-wire';
import type { WirePicture } from '../../../lib/picture-wire';
import { MessageBubble } from './MessageBubble';
import styles from './MessageList.module.css';

export const GET_CHAT_MESSAGES = gql(`
  query GetChatMessages($chatId: ID!) {
    messages(chatId: $chatId, limit: 50) {
      id
      content
      picture {
        width
        height
        bits
      }
      movie {
        width
        height
        frames
        bits
      }
      sound {
        frames
        bits
      }
      sender {
        id
        name
        avatar {
          width
          height
          bits
        }
      }
      createdAt
    }
  }
`);

interface MessageListProps {
  chatId: string;
  currentUserId: string | undefined;
  /** Name each run's sender: in groups and channels, not direct chats. */
  showNames: boolean;
  onDrawOnIt?: (picture: WirePicture) => void;
  onDrawOnMovie?: (movie: WireMovie) => void;
  /** Opens Get Info on a message: a click on it. */
  onGetInfo?: (messageId: string) => void;
}

export function MessageList({
  chatId,
  currentUserId,
  showNames,
  onDrawOnIt,
  onDrawOnMovie,
  onGetInfo,
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // The page's feed appends live messages; opening the chat also refreshes
  // it, catching anything sent while this tab was offline or asleep.
  const { data: messagesData, loading: messagesLoading } = useQuery(
    GET_CHAT_MESSAGES,
    {
      variables: { chatId },
      fetchPolicy: 'cache-and-network',
    }
  );

  // Open on the latest message; glide only to ones that arrive after.
  const hasScrolled = useRef(false);
  useEffect(() => {
    if (!messagesEndRef.current) return;
    messagesEndRef.current.scrollIntoView({
      behavior: hasScrolled.current ? 'smooth' : 'instant',
    });
    hasScrolled.current = true;
  }, [messagesData?.messages]);

  // Whatever's on a visible screen has been read.
  useReading(messagesData?.messages.at(-1)?.id);

  if (messagesLoading && !messagesData) {
    return (
      <div className={styles.root}>
        <LoadingState label="Loading messages" />
      </div>
    );
  }

  const messages = messagesData?.messages ?? [];

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
    <div className={styles.root} role="log" aria-label="Messages">
      {messages.map((message, index) => (
        <MessageBubble
          key={message.id}
          message={message}
          isCurrentUser={message.sender.id === currentUserId}
          showMeta={messages[index - 1]?.sender.id !== message.sender.id}
          showName={showNames}
          onDrawOnIt={onDrawOnIt}
          onDrawOnMovie={onDrawOnMovie}
          onGetInfo={onGetInfo && (() => onGetInfo(message.id))}
        />
      ))}
      <div ref={messagesEndRef} />
    </div>
  );
}
