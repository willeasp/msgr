import { useSubscription } from '@apollo/client/react';
import { useLayoutEffect, useRef } from 'react';
import { withMessage, withReceivedMessage } from '../../lib/chat-list';
import { gql } from '../../lib/__generated__';
import { GET_CHATS } from '../components/chat/ChatSidebar';
import { GET_CHAT_MESSAGES } from '../components/chat/MessageList';
import type { ArrivedMessage } from './use-alerts';

// Selects a whole chat-list row, so a chat the list hasn't seen can join it.
const MESSAGE_RECEIVED_SUBSCRIPTION = gql(`
  subscription OnMessageReceivedForSidebar {
    messageReceived {
      id
      content
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

/**
 * Every message to any of the viewer's chats, for as long as the chat page is
 * open, whichever windows are showing: keeps the chat list and each chat's
 * history current, and hands each message to `onMessage`.
 */
export function useChatFeed(onMessage: (message: ArrivedMessage) => void) {
  // The subscription keeps its first handler; read the latest one through a ref.
  const latest = useRef(onMessage);
  useLayoutEffect(() => {
    latest.current = onMessage;
  });

  useSubscription(MESSAGE_RECEIVED_SUBSCRIPTION, {
    onData: ({ data, client }) => {
      const message = data.data?.messageReceived;
      if (!message) return;
      client.cache.updateQuery({ query: GET_CHATS }, (existing) =>
        existing
          ? { chats: withReceivedMessage(existing.chats, message) }
          : existing
      );
      // The chat's history too, open or not, so it is current when opened.
      const { chat, id, content, createdAt, sender } = message;
      client.cache.updateQuery(
        { query: GET_CHAT_MESSAGES, variables: { chatId: chat.id } },
        (existing) =>
          existing && {
            messages: [
              ...withMessage(existing.messages, {
                __typename: 'Message' as const,
                id,
                content,
                createdAt,
                sender,
              }),
            ],
          }
      );
      latest.current(message);
    },
  });
}
