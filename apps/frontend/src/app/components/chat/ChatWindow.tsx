import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import { isBlank, type Bits } from '@msgr/bitmap';
import { gql } from '../../../lib/__generated__';
import { ChatKind } from '../../../lib/__generated__/graphql';
import { pictureBits, type WirePicture } from '../../../lib/picture-wire';
import ActionButton from '../../../sacred/components/ActionButton';
import { useModals } from '../../../sacred/components/page/ModalContext';
import { MacWindow } from '../MacWindow';
import { MessageInput } from './MessageInput';
import { MessageList } from './MessageList';
import { PaintDialog } from './PaintDialog';
import { firstImage, pictureFromFile } from './picture-from-file';
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
}

/** An open chat: its people up top, the conversation, and the composer. */
export function ChatWindow({
  chatId,
  currentUserId,
  onClose,
  onAddPeople,
}: ChatWindowProps) {
  const { data, loading } = useQuery(GET_CHAT_DATA, {
    variables: { chatId },
  });
  const chat = data?.chat;
  const title = chat?.title ?? (loading ? 'Loading…' : 'Chat');
  const { open } = useModals();
  // The picture going with the next message: drawn, or picked from a file.
  const [attachment, setAttachment] = useState<Bits | null>(null);
  const [attachError, setAttachError] = useState<string | null>(null);
  const attach = (bits: Bits) => {
    setAttachment(bits);
    setAttachError(null);
  };
  // Only the picture that was sent or removed; one attached since stays.
  const detach = (picture: Bits) => {
    setAttachment((now) => (now === picture ? null : now));
    setAttachError(null);
  };
  const attachFile = async (file: File) => {
    const bits = await pictureFromFile(file);
    if (!bits) {
      setAttachError('That file isn’t a picture this browser can open.');
    } else if (isBlank(bits)) {
      setAttachError('That picture comes out blank: nothing in it is dark.');
    } else {
      attach(bits);
    }
  };
  // A blank canvas, the attachment, or a picture from the chat to draw on.
  const draw = (start?: Bits) =>
    open(PaintDialog, {
      title: `Drawing for ${title}`,
      start,
      done: 'Attach',
      onDone: attach,
    });
  const drawOn = async (picture: WirePicture) => {
    const bits = await pictureBits(picture);
    if (bits) draw(bits);
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
      {/* A picture dropped anywhere on the chat is attached. */}
      <div
        className={styles.dropZone}
        onDragOver={(e) => {
          if (e.dataTransfer.types.includes('Files')) e.preventDefault();
        }}
        onDrop={(e) => {
          const file = firstImage(e.dataTransfer.files);
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
        />
        <MessageInput
          chatId={chatId}
          attachment={attachment}
          attachError={attachError}
          onDraw={draw}
          onAttachFile={(file) => void attachFile(file)}
          onDetach={detach}
        />
      </div>
    </MacWindow>
  );
}
