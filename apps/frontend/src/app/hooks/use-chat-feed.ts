import { useSubscription } from '@apollo/client/react';
import { useLayoutEffect, useRef } from 'react';
import {
  withChat,
  withMessage,
  withReceivedMessage,
} from '../../lib/chat-list';
import { gql } from '../../lib/__generated__';
import type { OnChatAddedSubscription } from '../../lib/__generated__/graphql';
import { GET_CHATS } from '../components/chat/ChatSidebar';
import { GET_CHAT_MESSAGES } from '../components/chat/MessageList';
import type { ArrivedMessage } from './use-alerts';

// Selects a whole chat-list row, so a chat the list hasn't seen can join it.
const MESSAGE_RECEIVED_SUBSCRIPTION = gql(`
  subscription OnMessageReceivedForSidebar {
    messageReceived {
      id
      content
      drawing
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

const CHAT_ADDED_SUBSCRIPTION = gql(`
  subscription OnChatAdded {
    chatAdded {
      reason
      by {
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
        messages(limit: 1) {
          id
          content
          createdAt
        }
      }
    }
  }
`);

export type AddedChat = OnChatAddedSubscription['chatAdded'];

/**
 * Everything live for the viewer, for as long as the chat page is open,
 * whichever windows are showing: every message to any of their chats, and
 * every chat that comes to include them. Keeps the chat list and each chat's
 * history current, and hands each event on to be alerted.
 */
export function useChatFeed(handlers: {
  onMessage: (message: ArrivedMessage) => void;
  onChatAdded: (event: AddedChat) => void;
}) {
  // Subscriptions keep their first handlers; read the latest ones through a ref.
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
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
      const { chat, id, content, drawing, createdAt, sender } = message;
      client.cache.updateQuery(
        { query: GET_CHAT_MESSAGES, variables: { chatId: chat.id } },
        (existing) =>
          existing && {
            messages: [
              ...withMessage(existing.messages, {
                __typename: 'Message' as const,
                id,
                content,
                drawing,
                createdAt,
                sender,
              }),
            ],
          }
      );
      latest.current.onMessage(message);
    },
  });

  useSubscription(CHAT_ADDED_SUBSCRIPTION, {
    onData: ({ data, client }) => {
      const event = data.data?.chatAdded;
      if (!event) return;
      client.cache.updateQuery({ query: GET_CHATS }, (existing) =>
        existing
          ? { chats: [...withChat(existing.chats, event.chat)] }
          : existing
      );
      latest.current.onChatAdded(event);
    },
  });
}
