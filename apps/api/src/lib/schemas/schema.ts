import { gql } from 'graphql-tag';

// Base type definitions with dummy fields for Query and Mutation
const baseTypeDefs = gql`
  scalar DateTime

  type Query {
    _empty: String
  }

  type Mutation {
    _empty: String
  }

  type Subscription {
    _empty: String
  }
`;

// User type definitions
const userTypeDefs = gql`
  type User {
    id: ID!
    email: String!
    name: String!
  }

  extend type Query {
    user(id: ID!): User
    users(query: String): [User!]!
    me: User
  }
`;

// Auth type definitions
const authTypeDefs = gql`
  type AuthPayload {
    user: User!
    token: String!
  }

  extend type Mutation {
    login(email: String!, password: String!): AuthPayload!
    logout: Boolean!
  }
`;

// Chat type definitions
const chatTypeDefs = gql`
  type Chat {
    id: ID!
    title: String!
    participants: [User!]!
    messages(limit: Int = 50, offset: Int = 0): [Message!]!
  }

  input CreateChatInput {
    title: String
    participantIds: [ID!]!
  }

  extend type Query {
    chats: [Chat!]!
    chat(id: ID!): Chat
  }

  extend type Mutation {
    findOrCreateChat(participantId: ID!): Chat!
  }
`;

// Message type definitions
const messageTypeDefs = gql`
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

  extend type Query {
    messages(chatId: ID!, limit: Int = 50, offset: Int = 0): [Message!]!
  }

  extend type Mutation {
    sendMessage(input: SendMessageInput!): Message!
  }

  extend type Subscription {
    messageReceived: Message!
  }
`;

// Combine the type definitions into an array
export const typeDefs = [
  baseTypeDefs,
  userTypeDefs,
  authTypeDefs,
  chatTypeDefs,
  messageTypeDefs,
];
