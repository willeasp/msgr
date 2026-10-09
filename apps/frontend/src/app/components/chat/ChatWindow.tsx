import { useQuery } from '@apollo/client/react';
import { gql } from '../../../lib/__generated__';
import { ChatKind } from '../../../lib/__generated__/graphql';
import { MacWindow } from '../MacWindow';
import { MessageInput } from './MessageInput';
import { MessageList } from './MessageList';

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
}

/** An open chat: its people up top, the conversation, and the composer. */
export function ChatWindow({
  chatId,
  currentUserId,
  onClose,
}: ChatWindowProps) {
  const { data, loading } = useQuery(GET_CHAT_DATA, {
    variables: { chatId },
  });
  const chat = data?.chat;
  const count = chat?.participants.length ?? 0;
  const [one, many] =
    chat?.kind === ChatKind.Channel
      ? ['member', 'members']
      : ['person', 'people'];

  return (
    <MacWindow
      title={chat?.title ?? (loading ? 'Loading…' : 'Chat')}
      onClose={onClose}
      info={
        chat && (
          <>
            <span>
              {count} {count === 1 ? one : many}
            </span>
            <span>{chat.participants.map(({ name }) => name).join(', ')}</span>
          </>
        )
      }
      fill
    >
      <MessageList chatId={chatId} currentUserId={currentUserId} />
      <MessageInput chatId={chatId} />
    </MacWindow>
  );
}
