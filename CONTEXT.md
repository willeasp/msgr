# Messaging

People join by invite, sign in, open chats with each other and exchange messages that arrive live.

## Language

### People

**User**:
Someone with an account: an id, a unique email and a profile.
_Avoid_: Account, member

**Profile**:
What a user shows others of themselves: a display name and an avatar, changed together. Everyone who shares a chat with them sees a change at once.

**Avatar**:
A user's own picture, exactly 64×64, drawn or dithered from a photo's middle square; or none. With none, their face is the default: a pattern made from their id.
_Avoid_: Profile picture (in code), photo

**Face**:
How a user appears beside their messages and on their direct chat in the list: their avatar, or else the default pattern.
_Avoid_: Identicon (that's only the default)

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
Text, a picture, or both, posted by a participant to a chat at a point in time; never neither. Text is trimmed and non-blank.

**Picture**:
A black-and-white image in a message, 1 to 320 pixels a side, drawn in the paint window or dithered from a photo on the sender's device. It is never blank.
_Avoid_: Image, attachment, file

**Drawing**:
A picture made in the paint window, 256×160 when started blank. Stored and sent like any other picture.
_Avoid_: Doodle, sketch

**Activity**:
When a chat last received a message. A viewer's chats are listed most recently active first. Opening a chat, or joining or leaving a channel, is not activity.

**Page**:
A window into a chat's history, counted back from the newest message and returned oldest first.

**Feed**:
The live stream of every message posted to any chat the viewer participates in, including the viewer's own messages.

**Link preview**:
The card above a message for the first link in it: the page's site, title, description and a dithered thumbnail, as our server read the page.
_Avoid_: Unfurl, embed

**Chat added**:
The live notice that a chat now includes the viewer without them opening it: someone they invited signed up, or someone added them to a channel. It says who did it.

**Notification**:
What a viewer's device shows, with Msgr open or not, when someone else posts to one of their chats or a chat comes to include them. They're sent by Web Push to every browser where the viewer turned notifications on, except for a chat they're watching.
_Avoid_: Alert (that's the beep and the unread count in the tab), push (that's how it travels)

**Watching**:
Having a chat open in a visible Msgr window. A chat you're watching doesn't notify you, on any device.
