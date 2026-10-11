import { useId, useRef, useState } from 'react';
import { useMutation } from '@apollo/client/react';
import type { Bits } from '@msgr/bitmap';
import { parseCommand } from '../../../lib/commands';
import { gql } from '../../../lib/__generated__';
import { toWire } from '../../../lib/picture-wire';
import Button from '../../../sacred/components/Button';
import TextArea from '../../../sacred/components/TextArea';
import { pixelSize, useBitmapCanvas } from '../../hooks/use-bitmap-canvas';
import { recordMessage } from '../../hooks/use-chat-feed';
import { useMediaQuery } from '../../hooks/use-media-query';
import { firstImage } from './picture-from-file';
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
      createdAt
      sender {
        id
        name
      }
      chat {
        id
        kind
        title
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
  /** The picture going with the message, if any; sent with or without text. */
  attachment: Bits | null;
  /** Why the last photo couldn't be attached. */
  attachError: string | null;
  /** Opens the paint window, on a blank canvas or on `start`. */
  onDraw: (start?: Bits) => void;
  /** Attaches a photo picked, pasted or dropped. */
  onAttachFile: (file: File) => void;
  /** Takes off this attachment, once sent or removed. */
  onDetach: (picture: Bits) => void;
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
  attachment,
  attachError,
  onDraw,
  onAttachFile,
  onDetach,
}: MessageInputProps) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [messageInput, setMessageInput] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const inputId = useId();
  const [commandError, setCommandError] = useState<string | null>(null);
  const { join } = useJoinChannel();
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
      const { data } = await sendMessage({
        variables: {
          chatId,
          content: content || null,
          picture: sent ? await toWire(sent) : null,
        },
      });
      if (sent && data) onDetach(sent);
    } catch {
      // Shown from `sendError`; the message and its picture stay to retry.
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
        const file = firstImage(e.clipboardData.files);
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
          <Attachment bits={attachment} onEdit={() => onDraw(attachment)} />
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
          }}
          onKeyDown={handleKeyDown}
          placeholder="Write a message"
          rows={1}
          enterKeyHint="send"
          isBlink
          autoFocus={hasMouse}
        />
      </div>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className={styles.hidden}
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          const file = firstImage(e.target.files);
          e.target.value = '';
          if (file) onAttachFile(file);
        }}
      />
      <Button
        theme="SECONDARY"
        type="button"
        onClick={() => fileRef.current?.click()}
      >
        Picture…
      </Button>
      <Button theme="SECONDARY" type="button" onClick={() => onDraw()}>
        Draw…
      </Button>
      {preparing || loading ? (
        <Button isDisabled>Sending</Button>
      ) : (
        <Button type="submit">Send</Button>
      )}
    </form>
  );
}
