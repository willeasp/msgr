export const typeDefs = /* GraphQL */ `
  "An ISO-8601 timestamp, e.g. 2026-01-31T12:00:00.000Z"
  scalar DateTime

  type User {
    id: ID!
    email: String!
    name: String!
  }

  type AuthPayload {
    user: User!
    "Also set as an httpOnly cookie. Pass it as connectionParams.token for subscriptions."
    token: String!
  }

  type Chat {
    id: ID!
    "A group chat's own title; for a direct chat, the other participant's name."
    title: String!
    participants: [User!]!
    "Paged back from the newest message (offset 0); each page is returned oldest first."
    messages(limit: Int, offset: Int): [Message!]!
  }

  type Message {
    id: ID!
    content: String!
    sender: User!
    chat: Chat!
    createdAt: DateTime!
  }

  input SendMessageInput {
    chatId: ID!
    content: String!
  }

  type Query {
    "The signed-in user, or null."
    me: User
    "Users whose name or email contains the query, excluding the viewer."
    users(query: String!): [User!]!
    "The viewer's chats, most recently active first."
    chats: [Chat!]!
    "A chat the viewer is in, or null."
    chat(id: ID!): Chat
    "Paged back from the newest message (offset 0); each page is returned oldest first."
    messages(chatId: ID!, limit: Int, offset: Int): [Message!]!
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    logout: Boolean!
    "The viewer's direct chat with a user, created on first contact."
    findOrCreateChat(participantId: ID!): Chat!
    sendMessage(input: SendMessageInput!): Message!
  }

  type Subscription {
    "Every message sent to a chat the viewer is in, including their own."
    messageReceived: Message!
  }
`;
