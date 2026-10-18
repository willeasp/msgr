import type { ApolloCache } from '@apollo/client';
import { useSubscription } from '@apollo/client/react';
import { useLayoutEffect, useRef } from 'react';
import {
  withChat,
  withMessage,
  withReceivedMessage,
} from '../../lib/chat-list';
import { gql } from '../../lib/__generated__';
import type { OnChatAddedSubscription } from '../../lib/__generated__/graphql';
import type { ReceivedMessage } from '../../lib/chat-list';
import { GET_CHATS } from '../components/chat/ChatSidebar';
import { GET_CHAT_MESSAGES } from '../components/chat/MessageList';
import type { ArrivedMessage } from './use-alerts';

// Selects a whole chat-list row, so a chat the list hasn't seen can join it.
const MESSAGE_RECEIVED_SUBSCRIPTION = gql(`
  subscription OnMessageReceivedForSidebar {
    messageReceived {
      id
      content
      picture {
        width
        height
        bits
      }
      movie {
        width
        height
        frames
        bits
      }
      createdAt
      sender {
        id
        name
        avatar {
          width
          height
          bits
        }
      }
      chat {
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
        }
        messages(limit: 1) {
          id
          content
          movie {
            frames
          }
          createdAt
        }
      }
    }
  }
`);

/**
 * The one way a message gets into the cache, whether the feed brought it or
 * the viewer just sent it: onto the chat list and into the chat's history,
 * together, so the two can't disagree. Hence sending selects all the feed does.
 */
export function recordMessage(cache: ApolloCache, message: ReceivedMessage) {
  cache.updateQuery({ query: GET_CHATS }, (existing) =>
    existing
      ? { chats: [...withReceivedMessage(existing.chats, message)] }
      : existing
  );
  // The chat's history too, open or not, so it is current when opened.
  const { chat, id, content, picture, movie, createdAt, sender } = message;
  cache.updateQuery(
    { query: GET_CHAT_MESSAGES, variables: { chatId: chat.id } },
    (existing) =>
      existing && {
        // Sent and delivered both arrive here; whichever is second changes nothing.
        messages: [
          ...withMessage(existing.messages, {
            __typename: 'Message' as const,
            id,
            content,
            picture,
            movie,
            createdAt,
            sender,
          }),
        ],
      }
  );
}

// Each person is cached once, by id, so their new name and picture reach
// every message, row and title that shows them without another line here.
const PROFILE_CHANGED_SUBSCRIPTION = gql(`
  subscription OnProfileChanged {
    profileChanged {
      id
      name
      avatar {
        width
        height
        bits
      }
    }
  }
`);

export type AddedChat = OnChatAddedSubscription['chatAdded'];

/**
 * Everything live for the viewer, for as long as the chat page is open,
 * whichever windows are showing: every message to any of their chats,
 * every chat that comes to include them, and every change to the profile of
 * someone they share a chat with. Keeps the chat list and each chat's
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
      recordMessage(client.cache, message);
      latest.current.onMessage(message);
    },
  });

  useSubscription(PROFILE_CHANGED_SUBSCRIPTION);

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
