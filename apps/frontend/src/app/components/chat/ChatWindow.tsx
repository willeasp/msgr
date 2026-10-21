import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { isBlank, type Bits, type Frames } from '@msgr/bitmap';
import { gql } from '../../../lib/__generated__';
import { ChatKind } from '../../../lib/__generated__/graphql';
import { isBlankMovie, type Drawing } from '../../../lib/movie';
import { movieFrames, type WireMovie } from '../../../lib/movie-wire';
import { pictureBits, type WirePicture } from '../../../lib/picture-wire';
import ActionButton from '../../../sacred/components/ActionButton';
import { useModals } from '../../../sacred/components/page/ModalContext';
import { MacWindow } from '../MacWindow';
import { MessageInput } from './MessageInput';
import { MessageList } from './MessageList';
import { PaintDialog } from './PaintDialog';
import type { Attachment } from './attachment';
import { firstMedia, isVideo } from './movie-from-file';
import { pictureFromFile } from './picture-from-file';
import { isAudio } from './sound-from-file';
import { SoundDialog } from './SoundDialog';
import { TrimDialog } from './TrimDialog';
import { TypingStatus } from './TypingStatus';
import type { Typists } from '../../hooks/use-typing';
import styles from './ChatWindow.module.css';
import { PixelText } from '../PixelText';

export const GET_CHAT_DATA = gql(`
  query GetChatData($chatId: ID!) {
    chat(id: $chatId) {
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
        email
      }
    }
  }
`);

interface ChatWindowProps {
  chatId: string;
  currentUserId: string | undefined;
  onClose: () => void;
  /** Given for channels, which can take more people. */
  onAddPeople?: () => void;
  /** Who is writing where, for the title bar. */
  typists: Typists;
  /** Opens Get Info on a message, when it's clicked. */
  onGetInfo: (messageId: string) => void;
}

/** An open chat: its people up top, the conversation, and the composer. */
export function ChatWindow({
  chatId,
  currentUserId,
  onClose,
  onAddPeople,
  typists,
  onGetInfo,
}: ChatWindowProps) {
  const { data, loading } = useQuery(GET_CHAT_DATA, {
    variables: { chatId },
  });
  const chat = data?.chat;
  const title = chat?.title ?? (loading ? 'Loading…' : 'Chat');
  const { open } = useModals();
  // The picture, movie or sound going with the next message: drawn,
  // recorded, or made from a file.
  const [attachment, setAttachment] = useState<Attachment | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const attach = (next: Attachment) => {
    setAttachment(next);
    setAttachError(null);
  };
  // Only what was sent or removed; anything attached since stays.
  const detach = (sent: Attachment) => {
    setAttachment((now) => (now === sent ? null : now));
    setAttachError(null);
  };
  // Recorded, or from a file picked there or dropped here.
  const makeSound = (file?: File) =>
    open(SoundDialog, {
      title: `Sound for ${title}`,
      file,
      onDone: (codes) => attach({ kind: 'sound', codes }),
    });
  const attachFile = async (file: File) => {
    if (isAudio(file)) {
      makeSound(file);
      return;
    }
    if (isVideo(file)) {
      open(TrimDialog, {
        title: `Movie for ${title}`,
        file,
        onDone: (movie) =>
          isBlankMovie(movie)
            ? setAttachError(
                'That video comes out blank: nothing in it is dark.'
              )
            : attach({ kind: 'movie', movie, drawing: null }),
      });
      return;
    }
    const bits = await pictureFromFile(file);
    if (!bits) {
      setAttachError('That file isn’t a picture this browser can open.');
    } else if (isBlank(bits)) {
      setAttachError('That picture comes out blank: nothing in it is dark.');
    } else {
      attach({ kind: 'picture', bits });
    }
  };
  // A blank canvas, or a picture from the chat or the attachment, to draw on.
  const draw = (start?: Bits) =>
    open(PaintDialog, {
      title: `Drawing for ${title}`,
      start,
      done: 'Attach',
      onDone: (bits) => attach({ kind: 'picture', bits }),
    });
  // A movie from the chat or the attachment, to draw over.
  const drawOver = (movie: Frames, drawing: Drawing | null = null) =>
    open(PaintDialog, {
      title: `Drawing for ${title}`,
      movie,
      drawing,
      done: 'Attach',
      onDone: (drawn: Drawing) =>
        attach({ kind: 'movie', movie, drawing: drawn }),
    });
  const edit = (attached: Attachment) => {
    if (attached.kind === 'picture') draw(attached.bits);
    else if (attached.kind === 'movie')
      drawOver(attached.movie, attached.drawing);
  };
  const drawOn = async (picture: WirePicture) => {
    const bits = await pictureBits(picture);
    if (bits) draw(bits);
  };
  const drawOnMovie = (movie: WireMovie) => {
    const frames = movieFrames(movie);
    if (frames) drawOver(frames);
  };
  const count = chat?.participants.length ?? 0;
  const [one, many] =
    chat?.kind === ChatKind.Channel
      ? ['member', 'members']
      : ['person', 'people'];

  return (
    <MacWindow
      title={title}
      onClose={onClose}
      status={<TypingStatus typists={typists} chatId={chatId} />}
      info={
        chat && (
          <>
            <span>
              {count} {count === 1 ? one : many}
            </span>
            <span className={styles.names}>
              <PixelText
                text={chat.participants.map(({ name }) => name).join(', ')}
              />
            </span>
            {onAddPeople && (
              <ActionButton onClick={onAddPeople}>Add People…</ActionButton>
            )}
          </>
        )
      }
      fill
    >
      {/* A picture, video or sound dropped anywhere on the chat is attached. */}
      <div
        className={styles.dropZone}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) e.preventDefault();
        }}
        onDrop={(e) => {
          const file = firstMedia(e.dataTransfer.files);
          if (!file) return;
          e.preventDefault();
          void attachFile(file);
        }}
      >
        <MessageList
          chatId={chatId}
          currentUserId={currentUserId}
          showNames={!!chat && chat.kind !== ChatKind.Direct}
          onDrawOnIt={drawOn}
          onDrawOnMovie={drawOnMovie}
          onGetInfo={onGetInfo}
        />
        <MessageInput
          chatId={chatId}
          attachment={attachment}
          attachError={attachError}
          onDraw={() => draw()}
          onEdit={edit}
          onSound={() => makeSound()}
          onAttachFile={(file) => void attachFile(file)}
          onDetach={detach}
        />
      </div>
    </MacWindow>
  );
}
