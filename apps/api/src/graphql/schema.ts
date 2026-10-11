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

  "Text, a picture, or both: at least one of content and picture is set."
  type Message {
    id: ID!
    "The text; null for a picture alone."
    content: String
    "A picture, drawn or dithered from a photo; null for text alone."
    picture: Picture
    sender: User!
    chat: Chat!
    createdAt: DateTime!
  }

  "A card for a link: what the page says about itself, as our server read it."
  type LinkPreview {
    url: String!
    "The site's name, e.g. Wikipedia."
    site: String!
    title: String!
    description: String
    "The page's picture as a 64×64 black-and-white thumbnail: rows top to bottom, 8 pixels a byte with the leftmost in the high bit, 1 for ink, in base64. Null without one."
    thumbnail: String
  }

  "A black-and-white picture, 1 to 320 pixels a side."
  type Picture {
    width: Int!
    height: Int!
    "Rows top to bottom, each padded to whole bytes, 8 pixels a byte with the leftmost in the high bit, 1 for ink; compressed with raw DEFLATE, in base64."
    bits: String!
  }

  "As Picture: the server checks its bits inflate to exactly its size."
  input PictureInput {
    width: Int!
    height: Int!
    bits: String!
  }

  "Text, a picture, or both."
  input SendMessageInput {
    chatId: ID!
    content: String
    picture: PictureInput
  }

  "Where one browser receives Web Push, from its PushSubscription.toJSON()."
  input PushSubscriptionInput {
    endpoint: String!
    p256dh: String!
    auth: String!
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
    "A card for the first link in a message the viewer can see, or null."
    linkPreview(messageId: ID!): LinkPreview
    "Whether an invite can still sign someone up. Used, expired and made-up codes all say false. Needs no sign-in."
    inviteRedeemable(code: String!): Boolean!
    "The key browsers subscribe to Web Push with (VAPID, base64url); null while push is off. Needs no sign-in."
    pushKey: String
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
    "Notifies this browser of the viewer's chats, even with Msgr closed. A browser notifies one user at a time: whoever enabled it last."
    enablePush(subscription: PushSubscriptionInput!): Boolean!
    "Stops notifying this browser, if it was the viewer's."
    disablePush(endpoint: String!): Boolean!
  }

  type Subscription {
    "Every message sent to a chat the viewer is in, including their own."
    messageReceived: Message!
    "Every chat that comes to include the viewer without them opening it."
    chatAdded: ChatAdded!
    "Held while a visible page shows this chat, so its messages don't notify the viewer. Never sends anything."
    watching(chatId: ID!): Boolean
  }
`;
