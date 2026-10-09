# Messaging

People sign in, open chats with each other and exchange messages that arrive live.

## Language

### People

**User**:
Someone with an account: an id, a unique email and a display name.
_Avoid_: Account, member, profile

**Viewer**:
The signed-in user a request is made on behalf of. Every rule is phrased from the viewer's side.
_Avoid_: Current user, me, actor

**Session**:
Proof, as a signed and expiring token, that the bearer is a given user. It is issued at login and travels as a cookie over HTTP and as a connection parameter over WebSocket.
_Avoid_: Auth, JWT (that's the encoding)

### Conversations

**Chat**:
A conversation between a fixed set of participants. It is either a direct chat or a group chat.
_Avoid_: Conversation, room, thread, channel

**Direct chat**:
A chat between exactly two users. Any two users share at most one. It has no title of its own and is titled by its counterpart's name.
_Avoid_: 1-on-1, DM, private chat

**Group chat**:
A chat with its own title and any number of participants. Two people can share a group chat as well as their direct chat.

**Participant**:
A user who is part of a chat. Only participants can see a chat, read it or post to it. To anyone else the chat does not exist.
_Avoid_: Member

**Counterpart**:
The other participant of a direct chat, as seen by the viewer.

**Message**:
Trimmed, non-blank text a participant posted to a chat at a point in time.

**Activity**:
When a chat last received a message. A viewer's chats are listed most recently active first. Opening a chat is not activity.

**Page**:
A window into a chat's history, counted back from the newest message and returned oldest first.

**Feed**:
The live stream of every message posted to any chat the viewer participates in, including the viewer's own messages.
