import type { ApolloCache } from '@apollo/client';
import {
  withChat,
  withMessage,
  withReceivedMessage,
  type ChatRow,
  type ReceivedMessage,
} from '../../lib/chat-list';
import { gql } from '../../lib/__generated__';

/*
 * The chats the whole app reads and keeps current: the list, a chat's
 * header, and its history. Each is cached once, so every window showing
 * them agrees; what changes them goes through `recordMessage` and
 * `recordChat`, the only two writes.
 */

/** The viewer's chats, most recently active first, each with its newest message. */
export const GET_CHATS = gql(`
  query GetChats {
    chats {
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
`);

/** A chat's title and people, for its window and its dialogs. */
export const GET_CHAT_DATA = gql(`
  query GetChatData($chatId: ID!) {
    chat(id: $chatId) {
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
        email
        avatar {
          width
          height
          url
        }
      }
    }
  }
`);

/** A chat's newest messages, oldest first. */
export const GET_CHAT_MESSAGES = gql(`
  query GetChatMessages($chatId: ID!) {
    messages(chatId: $chatId, limit: 50) {
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
      sender {
        id
        name
        avatar {
          width
          height
          url
        }
      }
      createdAt
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
  const { chat, id, content, picture, movie, sound, createdAt, sender } =
    message;
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
            sound,
            createdAt,
            sender,
          }),
        ],
      }
  );
}

/** A chat that now includes the viewer, onto the chat list. */
export function recordChat(cache: ApolloCache, chat: ChatRow) {
  cache.updateQuery({ query: GET_CHATS }, (existing) =>
    existing ? { chats: [...withChat(existing.chats, chat)] } : existing
  );
}
