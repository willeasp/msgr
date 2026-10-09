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
    "Also set as an httpOnly cookie, which authenticates subscriptions too. Clients without cookies pass it as connectionParams.token."
    token: String!
  }

  type SignUpPayload {
    user: User!
    "Also set as an httpOnly cookie, like login's."
    token: String!
    "The direct chat with whoever invited you, already started; null for an account nobody invited."
    chat: Chat
  }

  "A single-use way in for someone new. Share it as <app address>/invite/<code>."
  type Invite {
    code: String!
    expiresAt: DateTime!
  }

  input SignUpInput {
    inviteCode: String!
    name: String!
    email: String!
    password: String!
  }

  enum ChatKind {
    DIRECT
    GROUP
    CHANNEL
  }

  type Chat {
    id: ID!
    kind: ChatKind!
    "A group's own title, a channel's name after a #, or for a direct chat the other participant's name."
    title: String!
    participants: [User!]!
    "Paged back from the newest message (offset 0); each page is returned oldest first."
    messages(limit: Int, offset: Int): [Message!]!
  }

  enum ChatAddedReason {
    "Someone you invited signed up; this is your new direct chat with them."
    INVITE_ACCEPTED
    "Someone added you to this channel."
    ADDED_TO_CHANNEL
  }

  "A chat that now includes you without you opening it."
  type ChatAdded {
    chat: Chat!
    "Who did it: the person who used your invite, or who added you."
    by: User!
    reason: ChatAddedReason!
  }

  "A channel as the directory lists it: no messages, no members."
  type ChannelListing {
    "The name without its #."
    name: String!
    participantCount: Int!
    "Whether the viewer is in it."
    joined: Boolean!
    "The channel's chat, to open once joined."
    chatId: ID!
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
    "Every channel, by name, joined or not."
    channels: [ChannelListing!]!
  }

  type Mutation {
    login(email: String!, password: String!): AuthPayload!
    logout: Boolean!
    "Creates an account from an invite, signs it in like login, and starts its chat with whoever invited it."
    signUp(input: SignUpInput!): SignUpPayload!
    "A single-use invite from the viewer, valid for a week."
    createInvite: Invite!
    "The viewer's direct chat with a user, created on first contact."
    findOrCreateChat(participantId: ID!): Chat!
    sendMessage(input: SendMessageInput!): Message!
    "Joins the channel called name, creating it if nobody has yet."
    joinChannel(name: String!): Chat!
    "Leaves a channel. Direct and group chats cannot be left."
    leaveChannel(chatId: ID!): Boolean!
    "Adds people to a channel the viewer is in; each newcomer is told who added them."
    addToChannel(chatId: ID!, userIds: [ID!]!): Chat!
  }

  type Subscription {
    "Every message sent to a chat the viewer is in, including their own."
    messageReceived: Message!
    "Every chat that comes to include the viewer without them opening it."
    chatAdded: ChatAdded!
  }
`;
