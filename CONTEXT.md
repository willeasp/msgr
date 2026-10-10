# Messaging

People join by invite, sign in, open chats with each other and exchange messages that arrive live.

## Language

### People

**User**:
Someone with an account: an id, a unique email and a display name.
_Avoid_: Account, member, profile

**Viewer**:
The signed-in user a request is made on behalf of. Every rule is phrased from the viewer's side.
_Avoid_: Current user, me, actor

**Session**:
Proof, as a signed and expiring token, that the bearer is a given user. It is issued at login or sign-up and travels as an httpOnly cookie, over HTTP and WebSocket alike. Clients without cookies may pass it as a WebSocket connection parameter.
_Avoid_: Auth, JWT (that's the encoding)

**Invite**:
A single-use way in for someone new: a secret code, shared as a link, that lasts a week. Users make them; the very first comes from the `npm run invite` command. Signing up with one starts a direct chat between the newcomer and whoever made it. Used, expired and unknown invites are indistinguishable.
_Avoid_: Invitation code, referral, token

### Conversations

**Chat**:
A conversation between participants. It is a direct chat, a group chat or a channel.
_Avoid_: Conversation, room, thread

**Direct chat**:
A chat between exactly two users. Any two users share at most one. It has no title of its own and is titled by its counterpart's name.
_Avoid_: 1-on-1, DM, private chat

**Group chat**:
A chat with its own title and any number of participants. Two people can share a group chat as well as their direct chat.

**Channel**:
A chat with a name like `#general` that any user can find, join and leave; it is created by its first join. Its participants can also add other users to it. Names are lower-case letters, digits and dashes.
_Avoid_: Room, public chat

**Participant**:
A user who is part of a chat. Only participants can see a chat, read it or post to it. To anyone else the chat does not exist.
_Avoid_: Member

**Counterpart**:
The other participant of a direct chat, as seen by the viewer.

**Message**:
Text or a drawing a participant posted to a chat at a point in time. Text is trimmed and non-blank.

**Drawing**:
A 256×160 black-and-white picture made in the paint window and sent as a message. It is never blank.
_Avoid_: Doodle, sketch, image

**Activity**:
When a chat last received a message. A viewer's chats are listed most recently active first. Opening a chat, or joining or leaving a channel, is not activity.

**Page**:
A window into a chat's history, counted back from the newest message and returned oldest first.

**Feed**:
The live stream of every message posted to any chat the viewer participates in, including the viewer's own messages.

**Chat added**:
The live notice that a chat now includes the viewer without them opening it: someone they invited signed up, or someone added them to a channel. It says who did it.
