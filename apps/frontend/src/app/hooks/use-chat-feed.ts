import { useSubscription } from '@apollo/client/react';
import { useLayoutEffect, useRef } from 'react';
import { gql } from '../../lib/__generated__';
import type { OnChatAddedSubscription } from '../../lib/__generated__/graphql';
import type { TypingEvent } from '../../lib/typing';
import { recordChat, recordMessage } from '../data/chats';
import { received } from '../data/outbox';
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
        url
      }
      movie {
        width
        height
        frames
        url
      }
      sound {
        frames
        url
      }
      createdAt
      sender {
        id
        name
        avatar {
          width
          height
          url
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
            url
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
        unreadCount
        counterpart {
          id
          name
          avatar {
            width
            height
            url
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
          sound {
            frames
          }
          createdAt
        }
      }
    }
  }
`);

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
        url
      }
    }
  }
`);

// Someone writing to one of the viewer's chats; their name is cached like any.
const TYPING_SUBSCRIPTION = gql(`
  subscription OnTyping {
    typing {
      chatId
      user {
        id
        name
      }
    }
  }
`);

export type AddedChat = OnChatAddedSubscription['chatAdded'];

/**
 * Everything live for the viewer, for as long as the chat page is open,
 * whichever windows are showing: every message to any of their chats,
 * every chat that comes to include them, everyone writing to one, and every
 * change to the profile of someone they share a chat with. Keeps the chat list and each chat's
 * history current, and hands each event on to be alerted.
 */
export function useChatFeed(handlers: {
  viewerId: string;
  /** Whether the viewer is reading a chat now: on screen at its newest, on a page they see. */
  isReading: (chatId: string) => boolean;
  onMessage: (message: ArrivedMessage) => void;
  onChatAdded: (event: AddedChat) => void;
  onTyping: (event: TypingEvent) => void;
}) {
  // Subscriptions keep their first handlers; read the latest ones through a ref.
  const latest = useRef(handlers);
  useLayoutEffect(() => {
    latest.current = handlers;
  });

  // Every event goes to the cache and the handlers; none re-renders SignedIn,
  // which hosts the feed: what changed re-renders what reads it.
  useSubscription(MESSAGE_RECEIVED_SUBSCRIPTION, {
    ignoreResults: true,
    onData: ({ data, client }) => {
      const message = data.data?.messageReceived;
      if (!message) return;
      // One sent from here is stored, whether or not its answer comes.
      received(message);
      recordMessage(client.cache, message, {
        viewerId: latest.current.viewerId,
        reading: latest.current.isReading(message.chat.id),
      });
      latest.current.onMessage(message);
    },
  });

  useSubscription(PROFILE_CHANGED_SUBSCRIPTION, { ignoreResults: true });

  useSubscription(TYPING_SUBSCRIPTION, {
    ignoreResults: true,
    onData: ({ data }) => {
      const event = data.data?.typing;
      if (event) latest.current.onTyping(event);
    },
  });

  useSubscription(CHAT_ADDED_SUBSCRIPTION, {
    ignoreResults: true,
    onData: ({ data, client }) => {
      const event = data.data?.chatAdded;
      if (!event) return;
      recordChat(client.cache, event.chat);
      latest.current.onChatAdded(event);
    },
  });
}
