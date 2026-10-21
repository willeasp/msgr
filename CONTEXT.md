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
Text, a picture, a movie or a sound, or text with one of them, posted by a participant to a chat at a point in time; never neither, and never two of a picture, a movie and a sound. Text is trimmed and non-blank.

**Picture**:
A black-and-white image in a message, 1 to 320 pixels a side, drawn in the paint window or dithered from a photo on the sender's device. It is never blank.
_Avoid_: Image, attachment, file

**Drawing**:
A picture made in the paint window, 256×160 when started blank. Stored and sent like any other picture. Also what's drawn over a movie in the paint window: the same over every frame, and drawn into them when it's sent.
_Avoid_: Doodle, sketch

**Movie**:
A black-and-white moving picture in a message: 1 to 320 pixels a side and 1 to 48 frames, played at 8 frames a second and looping, like a GIF, with nothing to pause or wind. Made on the sender's device from up to 6 seconds of a video no longer than 10 minutes, perhaps drawn on. It is never blank.
_Avoid_: Video (that's the file it's made from), clip, GIF

**Sound**:
Up to a minute of sound in a message, squashed on purpose on the sender's device: 8,000 samples a second in frames of 20 ms, each frame keeping its bands' loudness and each frequency only as a step up, down or nothing, with what's lost played as noise. Recorded, or cut from a sound file of up to 15 minutes. It is never silent. It plays when pressed, one sound on the page at a time.
_Avoid_: Audio, voice message, voice note, clip

**Activity**:
When a chat last received a message. A viewer's chats are listed most recently active first. Opening a chat, or joining or leaving a channel, is not activity.

**Read**:
That a participant other than its sender has read a message, and when they first did. Having a chat open on a visible page reads it up to its newest message, and reading a message reads every one before it too. Get Info on a message shows its reads, and who has yet to.
_Avoid_: Seen, read receipt (in code)

**Get Info**:
A message's details, as Finder shows a file's: what it holds and how big, where and when it was sent, by whom, and its reads.

**Typing**:
The live notice that a participant is writing a message to a chat, told to its other participants. It lasts a few seconds unless it comes again, and their message ends it. Never stored.
_Avoid_: Composing, presence

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
