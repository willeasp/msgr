import { useQuery } from '@apollo/client/react';
import { gql } from '../../../lib/__generated__';
import { ChatKind } from '../../../lib/__generated__/graphql';
import ActionButton from '../../../sacred/components/ActionButton';
import { useModals } from '../../../sacred/components/page/ModalContext';
import { MacWindow } from '../MacWindow';
import { MessageInput } from './MessageInput';
import { MessageList } from './MessageList';
import { PaintDialog } from './PaintDialog';
import styles from './ChatWindow.module.css';

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
  // A blank canvas, or Draw on It with a drawing from the chat.
  const draw = (start?: string) =>
    open(PaintDialog, { chatId, chatTitle: title, start });
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
              {chat.participants.map(({ name }) => name).join(', ')}
            </span>
            {onAddPeople && (
              <ActionButton onClick={onAddPeople}>Add People…</ActionButton>
            )}
          </>
        )
      }
      fill
    >
      <MessageList
        chatId={chatId}
        currentUserId={currentUserId}
        onDrawOnIt={draw}
      />
      <MessageInput chatId={chatId} onDraw={() => draw()} />
    </MacWindow>
  );
}
