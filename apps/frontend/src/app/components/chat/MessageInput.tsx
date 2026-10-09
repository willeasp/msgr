import { useId, useRef, useState } from 'react';
import { useMutation } from '@apollo/client/react';
import { withMessage } from '../../../lib/chat-list';
import { parseCommand } from '../../../lib/commands';
import { gql } from '../../../lib/__generated__';
import Button from '../../../sacred/components/Button';
import TextArea from '../../../sacred/components/TextArea';
import { GET_CHAT_MESSAGES } from './MessageList';
import { useJoinChannel } from './use-join-channel';
import styles from './MessageInput.module.css';

const SEND_MESSAGE = gql(`
  mutation SendMessage($chatId: ID!, $content: String!) {
    sendMessage(input: { chatId: $chatId, content: $content }) {
      id
      content
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
}

export function MessageInput({ chatId }: MessageInputProps) {
  const [messageInput, setMessageInput] = useState('');
  const formRef = useRef<HTMLFormElement>(null);
  const inputId = useId();
  const [commandError, setCommandError] = useState<string | null>(null);
  const { join } = useJoinChannel();

  const [sendMessage, { loading: sendingMessage }] = useMutation(SEND_MESSAGE, {
    onCompleted: () => {
      setMessageInput('');
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
    if (!messageInput.trim() || sendingMessage) return;

    // "/join #general" joins a channel instead of being sent.
    const command = parseCommand(messageInput);
    if (command) {
      const failure = await join(command.channel);
      setCommandError(failure);
      if (!failure) setMessageInput('');
      return;
    }

    await sendMessage({
      variables: {
        chatId,
        content: messageInput,
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
          readOnly={sendingMessage}
          rows={1}
          isBlink
          autoFocus
        />
      </div>
      {sendingMessage ? (
        <Button isDisabled>Sending</Button>
      ) : (
        <Button type="submit">Send</Button>
      )}
    </form>
  );
}
