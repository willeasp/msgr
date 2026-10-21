import { useId, useMemo, useRef, useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { blank, type Bits } from '@msgr/bitmap';
import { parseCommand } from '../../../lib/commands';
import { gql } from '../../../lib/__generated__';
import { drawnOver, frameShown } from '../../../lib/movie';
import { toWire as movieToWire } from '../../../lib/movie-wire';
import { toWire } from '../../../lib/picture-wire';
import { toWire as soundToWire } from '../../../lib/sound-wire';
import Button from '../../../sacred/components/Button';
import TextArea from '../../../sacred/components/TextArea';
import { pixelSize, useBitmapCanvas } from '../../hooks/use-bitmap-canvas';
import { recordMessage } from '../../hooks/use-chat-feed';
import { Menu } from '../MenuBar';
import { useMediaQuery } from '../../hooks/use-media-query';
import { useMovieTick } from '../../hooks/use-movie';
import { useSayTyping } from '../../hooks/use-typing';
import type { Attachment } from './attachment';
import { firstMedia } from './movie-from-file';
import { SoundPlayer } from './SoundPlayer';
import { useJoinChannel } from './use-join-channel';
import styles from './MessageInput.module.css';

const SEND_MESSAGE = gql(`
  mutation SendMessage(
    $chatId: ID!
    $content: String
    $picture: PictureInput
    $movie: MovieInput
    $sound: SoundInput
  ) {
    sendMessage(
      input: {
        chatId: $chatId
        content: $content
        picture: $picture
        movie: $movie
        sound: $sound
      }
    ) {
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
      createdAt
      sender {
        id
        name
        avatar {
          width
          height
          bits
        }
      }
      chat {
        id
        kind
        title
        counterpart {
          id
          name
          avatar {
            width
            height
            bits
          }
        }
        participants {
          id
          name
        }
      }
    }
  }
`);

interface MessageInputProps {
  chatId: string;
  /** The picture, movie or sound going with the message, if any; sent with or without text. */
  attachment: Attachment | null;
  /** Why the last photo couldn't be attached. */
  attachError: string | null;
  /** Opens the paint window on a blank canvas. */
  onDraw: () => void;
  /** Opens the paint window on the attachment. */
  onEdit: (attachment: Attachment) => void;
  /** Opens the sound window, to record or choose a file. */
  onSound: () => void;
  /** Attaches a photo, video or sound picked, pasted or dropped. */
  onAttachFile: (file: File) => void;
  /** Takes off this attachment, once sent or removed. */
  onDetach: (attachment: Attachment) => void;
}

/** The attached picture, small, above the field: click it to paint on it. */
function AttachedPicture({ bits, onEdit }: { bits: Bits; onEdit: () => void }) {
  const { ref } = useBitmapCanvas(bits);
  return (
    <button
      type="button"
      className={styles.attachment}
      onClick={onEdit}
      aria-label="Edit picture"
    >
      <canvas
        ref={ref}
        width={bits.width}
        height={bits.height}
        className={styles.preview}
        style={pixelSize(bits)}
      />
    </button>
  );
}

/** The attached movie, looping with what's drawn over it: click it to draw. */
function AttachedMovie({
  attachment: { movie, drawing },
  onEdit,
}: {
  attachment: Extract<Attachment, { kind: 'movie' }>;
  onEdit: () => void;
}) {
  const tick = useMovieTick();
  const [shown] = useState(() => blank(movie.width, movie.height));
  // Each frame drawn into the same bytes, as a new object so the canvas repaints.
  const frame = useMemo(
    () => frameShown(movie, tick % movie.count, drawing, { ...shown }),
    [movie, drawing, tick, shown]
  );
  const { ref } = useBitmapCanvas(frame);
  return (
    <button
      type="button"
      className={styles.attachment}
      onClick={onEdit}
      aria-label="Draw on movie"
    >
      <canvas
        ref={ref}
        width={movie.width}
        height={movie.height}
        className={styles.preview}
        style={pixelSize(movie)}
      />
    </button>
  );
}

export function MessageInput({
  chatId,
  attachment,
  attachError,
  onDraw,
  onEdit,
  onSound,
  onAttachFile,
  onDetach,
}: MessageInputProps) {
  const pictureRef = useRef<HTMLInputElement>(null);
  const movieRef = useRef<HTMLInputElement>(null);
  const [messageInput, setMessageInput] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const inputId = useId();
  const [commandError, setCommandError] = useState<string | null>(null);
  const { join } = useJoinChannel();
  const typing = useSayTyping(chatId);
  // On a phone, opening a chat is for reading; the keyboard waits for a tap.
  const hasMouse = useMediaQuery('(pointer: fine)');

  // Compressing the picture, before the mutation's own loading begins.
  const [preparing, setPreparing] = useState(false);

  const [sendMessage, { loading, error: sendError }] = useMutation(
    SEND_MESSAGE,
    {
      // Keeps anything typed while it was sending.
      onCompleted: (_, options) => {
        const sent = options?.variables?.content;
        if (sent) setMessageInput((now) => (now.trim() === sent ? '' : now));
      },
      update: (cache, { data }) => {
        if (data?.sendMessage) recordMessage(cache, data.sendMessage);
      },
    }
  );

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = messageInput.trim();
    if ((!content && !attachment) || preparing || loading) return;

    // "/join #general" joins a channel instead of being sent.
    const command = attachment ? null : parseCommand(messageInput);
    if (command) {
      const failure = await join(command.channel);
      setCommandError(failure);
      if (!failure) setMessageInput('');
      return;
    }

    const sent = attachment;
    setPreparing(true);
    try {
      await typing.said();
      const { data } = await sendMessage({
        variables: {
          chatId,
          content: content || null,
          picture: sent?.kind === 'picture' ? await toWire(sent.bits) : null,
          movie:
            sent?.kind === 'movie'
              ? movieToWire(
                  sent.drawing
                    ? drawnOver(sent.movie, sent.drawing)
                    : sent.movie
                )
              : null,
          sound: sent?.kind === 'sound' ? soundToWire(sent.codes) : null,
        },
      });
      if (data) typing.sent();
      if (sent && data) onDetach(sent);
    } catch {
      // Shown from `sendError`; the message and its attachment stay to retry.
    } finally {
      setPreparing(false);
    }
  };

  // Enter sends; Shift+Enter (or an IME composition) adds a line.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  return (
    <form
      ref={formRef}
      onSubmit={handleSendMessage}
      className={styles.root}
      onPaste={(e) => {
        const file = firstMedia(e.clipboardData.files);
        if (!file) return;
        e.preventDefault();
        onAttachFile(file);
      }}
    >
      <label htmlFor={inputId} className={styles.hidden}>
        Message
      </label>
      {attachment && (
        <div className={styles.attached}>
          {attachment.kind === 'picture' ? (
            <AttachedPicture
              bits={attachment.bits}
              onEdit={() => onEdit(attachment)}
            />
          ) : attachment.kind === 'movie' ? (
            <AttachedMovie
              attachment={attachment}
              onEdit={() => onEdit(attachment)}
            />
          ) : (
            <span role="group" aria-label="Attached sound">
              <SoundPlayer
                frames={attachment.codes.frames}
                codes={attachment.codes}
              />
            </span>
          )}
          <Button theme="SECONDARY" onClick={() => onDetach(attachment)}>
            Remove
          </Button>
        </div>
      )}
      {[attachError, commandError, sendError?.message].map(
        (problem) =>
          problem && (
            <p key={problem} role="alert" className={styles.error}>
              {problem}
            </p>
          )
      )}
      <div className={styles.field}>
        <TextArea
          id={inputId}
          value={messageInput}
          onChange={(e) => {
            setMessageInput(e.target.value);
            setCommandError(null);
            typing.say(e.target.value);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Write a message"
          rows={1}
          enterKeyHint="send"
          isBlink
          autoFocus={hasMouse}
        />
      </div>
      {(
        [
          [pictureRef, 'image/*'],
          [movieRef, 'video/*'],
        ] as const
      ).map(([ref, accept]) => (
        <input
          key={accept}
          ref={ref}
          type="file"
          accept={accept}
          className={styles.hidden}
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            const file = firstMedia(e.target.files);
            e.target.value = '';
            if (file) onAttachFile(file);
          }}
        />
      ))}
      {/* Everything that goes with a message, in one pull-down menu. */}
      <Menu
        title="Attach"
        button={
          <Button theme="SECONDARY" type="button" aria-haspopup="menu">
            Attach
          </Button>
        }
        items={[
          { label: 'Picture…', onClick: () => pictureRef.current?.click() },
          { label: 'Movie…', onClick: () => movieRef.current?.click() },
          { label: 'Sound…', onClick: onSound },
          { label: 'Draw…', onClick: onDraw },
        ]}
      />
      {preparing || loading ? (
        <Button isDisabled>Sending</Button>
      ) : (
        <Button type="submit">Send</Button>
      )}
    </form>
  );
}
