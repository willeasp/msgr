import { useId, useRef, useState } from 'react';
import { useMutation } from '@apollo/client/react';
import type { Bits } from '@msgr/bitmap';
import { withMessage } from '../../../lib/chat-list';
import { parseCommand } from '../../../lib/commands';
import { gql } from '../../../lib/__generated__';
import { toWire } from '../../../lib/picture-wire';
import Button from '../../../sacred/components/Button';
import TextArea from '../../../sacred/components/TextArea';
import { GET_CHAT_MESSAGES } from './MessageList';
import { useBitmapCanvas } from '../../hooks/use-bitmap-canvas';
import { useMediaQuery } from '../../hooks/use-media-query';
import { pixelSize } from './MessagePicture';
import { useJoinChannel } from './use-join-channel';
import styles from './MessageInput.module.css';

const SEND_MESSAGE = gql(`
  mutation SendMessage(
    $chatId: ID!
    $content: String
    $picture: PictureInput
  ) {
    sendMessage(
      input: { chatId: $chatId, content: $content, picture: $picture }
    ) {
      id
      content
      picture {
        width
        height
        bits
      }
      sender {
        id
        name
      }
      createdAt
    }
  }
`);

interface MessageInputProps {
  chatId: string;
  /** Opens the paint window. */
  onDraw: () => void;
  /** The picture going with the message, if any; sent with or without text. */
  attachment: Bits | null;
  onAttachmentChange: (attachment: Bits | null) => void;
  /** Opens the attachment in the paint window. */
  onEditAttachment: () => void;
}

/** The attached picture, small, above the field: click it to paint on it. */
function Attachment({ bits, onEdit }: { bits: Bits; onEdit: () => void }) {
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

export function MessageInput({
  chatId,
  onDraw,
  attachment,
  onAttachmentChange,
  onEditAttachment,
}: MessageInputProps) {
  const [messageInput, setMessageInput] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const inputId = useId();
  const [commandError, setCommandError] = useState<string | null>(null);
  const { join } = useJoinChannel();
  // On a phone, opening a chat is for reading; the keyboard waits for a tap.
  const hasMouse = useMediaQuery('(pointer: fine)');

  // The attachment as sent, and as it is now: a newer one isn't cleared.
  const sentPicture = useRef<Bits | null>(null);
  const attached = useRef(attachment);
  attached.current = attachment;

  const [sendMessage, { loading: sendingMessage }] = useMutation(SEND_MESSAGE, {
    // Keeps anything typed, or attached, while it was sending.
    onCompleted: (_, options) => {
      const sent = options?.variables?.content;
      if (sent) setMessageInput((now) => (now.trim() === sent ? '' : now));
      if (sentPicture.current && sentPicture.current === attached.current) {
        onAttachmentChange(null);
      }
      sentPicture.current = null;
    },
    update: (cache, { data }) => {
      if (!data?.sendMessage) return;

      // Update cache with the new message
      cache.updateQuery(
        {
          query: GET_CHAT_MESSAGES,
          variables: { chatId },
        },
        (existing) =>
          existing && {
            // The feed may have delivered it already.
            messages: [...withMessage(existing.messages, data.sendMessage)],
          }
      );
    },
  });

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    const content = messageInput.trim();
    if ((!content && !attachment) || sendingMessage) return;

    // "/join #general" joins a channel instead of being sent.
    const command = attachment ? null : parseCommand(messageInput);
    if (command) {
      const failure = await join(command.channel);
      setCommandError(failure);
      if (!failure) setMessageInput('');
      return;
    }

    sentPicture.current = attachment;
    await sendMessage({
      variables: {
        chatId,
        content: content || null,
        picture: attachment ? await toWire(attachment) : null,
      },
    });
  };

  // Enter sends; Shift+Enter (or an IME composition) adds a line.
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  return (
    <form ref={formRef} onSubmit={handleSendMessage} className={styles.root}>
      <label htmlFor={inputId} className={styles.label}>
        Message
      </label>
      {attachment && (
        <div className={styles.attached}>
          <Attachment bits={attachment} onEdit={onEditAttachment} />
          <Button theme="SECONDARY" onClick={() => onAttachmentChange(null)}>
            Remove
          </Button>
        </div>
      )}
      {commandError && (
        <p role="alert" className={styles.error}>
          {commandError}
        </p>
      )}
      <div className={styles.field}>
        <TextArea
          id={inputId}
          value={messageInput}
          onChange={(e) => {
            setMessageInput(e.target.value);
            setCommandError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder="Write a message"
          rows={1}
          enterKeyHint="send"
          isBlink
          autoFocus={hasMouse}
        />
      </div>
      <Button theme="SECONDARY" type="button" onClick={onDraw}>
        Draw…
      </Button>
      {sendingMessage ? (
        <Button isDisabled>Sending</Button>
      ) : (
        <Button type="submit">Send</Button>
      )}
    </form>
  );
}
