import { useState } from 'react';
import { useQuery } from '@apollo/client/react';
import type { Bits } from '@msgr/bitmap';
import type { WirePicture } from '../../../lib/picture-wire';
import { gql } from '../../../lib/__generated__';
import { ChatKind } from '../../../lib/__generated__/graphql';
import ActionButton from '../../../sacred/components/ActionButton';
import { useModals } from '../../../sacred/components/page/ModalContext';
import { MacWindow } from '../MacWindow';
import { MessageInput } from './MessageInput';
import { MessageList } from './MessageList';
import { pictureBits } from './MessagePicture';
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
  // A blank canvas, the attachment, or a picture from the chat to draw on.
  const draw = (start?: Bits) =>
    open(PaintDialog, { chatTitle: title, start, onAttach: setAttachment });
  const drawOn = async (picture: WirePicture) => {
    const bits = await pictureBits(picture);
    if (bits) draw(bits);
  };
  const [attachError, setAttachError] = useState<string | null>(null);
  const attachFile = async (file: File) => {
    const bits = await pictureFromFile(file);
    setAttachError(
      bits ? null : 'That file isn’t a picture this browser can open.'
    );
    if (bits) setAttachment(bits);
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
          onDrawOnIt={drawOn}
        />
        <MessageInput
          chatId={chatId}
          onDraw={() => draw()}
          attachment={attachment}
          attachError={attachError}
          onAttachFile={(file) => void attachFile(file)}
          onAttachmentChange={(bits) => {
            setAttachment(bits);
            setAttachError(null);
          }}
          onEditAttachment={() => attachment && draw(attachment)}
        />
      </div>
    </MacWindow>
  );
}
