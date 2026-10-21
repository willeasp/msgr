# Manual testing

A walk through everything Msgr does, to try the experience by hand. Each item
says what to do and what you should see.

The rules underneath have automated tests: the API's invites, throttling,
channels, sessions and security headers, and the app's pure logic in
`apps/frontend/src/lib`. On screen, only signing in has browser tests so far
(`apps/e2e`, run with `npm run e2e`). The rest (forms, dialogs, menus,
keyboard, notifications, layout) is checked here.

## Setup

- [ ] Run `npm run db:start` (keep it running) and `npm run dev`. The app is at
      http://localhost:4200.
- [ ] Run `npm run db:seed` for the sample chats, including `#general`. It
      deletes all chats and messages and recreates the sample ones, but keeps
      accounts. Every seeded account's password is `password123`.
- [ ] To be two people at once, use a normal window and a private/incognito
      window (they have separate cookies): `test@example.com` in one,
      `alice@example.com` in the other.

## 1. Look and feel

- [ ] **Login page:** dotted grey desktop, rounded black screen corners, a live
      clock top right. The "Welcome to Msgr." dialog opens with a quick stepped
      zoom.
- [ ] **View menu:** switch Light/Dark and try a few tints; the current choice
      has a ✓. Reload: the choice sticks, with no flash of the wrong theme.
- [ ] **About:** click the speech-bubble logo top left. An About box appears;
      OK or Esc closes it.
- [ ] **Narrow window** (under 760px wide, or DevTools device mode): one window
      at a time. Opening a chat fills the screen; the close box at the top left
      of its title bar goes back to the list.
- [ ] _Optional:_ with macOS's Reduce Motion on, dialogs open without the zoom
      and the cursor stops blinking.

## 2. Signing in and out

- [ ] **Return signs in**, just like the Sign In button. Check it both after
      opening http://localhost:4200/ (which sends you to the login page) and
      after opening http://localhost:4200/login directly.
- [ ] **Wrong password:** "Invalid email or password" in a framed alert.
- [ ] **Throttling:** try one email 11 times quickly. The 11th says "Too many
      attempts. Wait a few minutes and try again." It clears after 15 minutes
      or an API restart. Successful logins count toward the 10 too.
- [ ] **Sign in** as Test User and you land on the desktop.
- [ ] **No stale user:** File → Log Out, then sign in as Alice. The menu bar and
      chat list show Alice's name and chats, not Test User's.
- [ ] **Sessions last:** close the browser and reopen it. You're still signed in
      (sessions last 30 days).
- [ ] **No token in storage:** in DevTools → Application, Local Storage has no
      token; Cookies have `token`, marked HttpOnly.

## 3. Invites and sign-up

- [ ] **Make an invite:** File → Invite a Friend… shows a link and an expiry date
      a week out. Copy Link changes to "Copied".
- [ ] **Sign up:** open the link in a fresh private window and you see "You're
      invited." Sign up with a new name, email and password, pressing Return.
      You land in a chat with whoever invited you, signed in as the new person.
- [ ] **The inviter hears about it:** in the inviter's window, the newcomer's
      chat appears at the top of the list, with a beep and a desktop
      notification: "<name> joined Msgr".
- [ ] **Back on your link:** as the newcomer, open the same link again. You're
      back in your chats, not on the form.
- [ ] **Spent link:** open the same link in a fresh private window. Straight
      away, with no form: "This invite has been used or has expired." Sign In
      goes to the login page.
- [ ] **Made-up link:** go to `localhost:4200/invite/whatever`. Same message.
- [ ] **Taken email:** with a fresh invite, sign up as `alice@example.com`.
      "Someone already signed up with this email." Then use a different email:
      the same invite still works.
- [ ] **Short password:** under 8 characters isn't accepted.
- [ ] **First invite from the command line:** `npm run invite` prints a working
      link.

## 4. Direct chats

- [ ] **New chat:** Control+K or File → New Chat…. Type 2+ letters of a name or
      email, press ↓ to reach the results and Return to open the chat. You
      never appear in your own results.
- [ ] **Closing the dialog:** Esc, Cancel and clicking outside all close it; the
      page behind is dimmed with a dot pattern while it's open.
- [ ] **Existing chat:** starting a chat with someone you already have reopens
      that chat; it doesn't create a second one.
- [ ] **Shortcut while typing:** Control+K also works from inside the message
      box.

## 5. Messaging (use both windows)

- [ ] **Return sends; Shift+Return adds a line.** A long message wraps; the box
      grows to 8 lines, then scrolls. Blank messages don't send.
- [ ] **Live:** Alice's message appears instantly in Test User's chat, which
      jumps to the top of the list with the new preview.
- [ ] **Bubbles:** yours are black and on the right; theirs are outlined on the
      left. A name and time appear only when the sender changes. Hover a bubble
      for its full timestamp.
- [ ] **Closed chats stay current:** with a chat _closed_, have the other person
      write in it. Opening it shows the new message.
- [ ] **New chat:** a brand-new chat says "No messages yet. Say hello."
- [ ] **Links:** a link in a message is underlined in the bubble's colour and
      opens in a new tab. The first link gets a card above the bubble: the
      site, the title, two lines of description and the page's picture
      dithered to 64×64 (a document icon without one). Try a Wikipedia article
      and a GitHub page; a page that can't be previewed just stays a link.
- [ ] **Pixel emoji:** emoji in messages, the chat list, names and window
      titles are black-and-white pixel art in the text's colour, white in your
      own bubbles and in the theme's ink in Dark and the tints. A message of one
      to three emoji shows them big. Copying a message gives the real emoji.
- [ ] **Attach:** the button beside Send opens a menu of Picture…, Movie…,
      Sound… and Draw…, above it, by mouse, touch or keyboard (arrows, Return,
      Esc).
- [ ] **Drawing:** Attach → Draw… opens "Drawing for _chat_". Try each tool: the pencil
      (starting on black, it draws white), the brush and the paint bucket in a
      few patterns, and the eraser. Undo (⌘Z or Ctrl+Z) steps back through
      strokes, fills and Clear. Attach is greyed out while the canvas is blank.
- [ ] **Sending a picture:** Attach puts it above the message box; click it to
      paint on it again, or Remove it. Send it alone and with text: it arrives
      live in the other window, the chat list previews a picture alone as
      "Picture", and a notification says "Sent a picture."
- [ ] **Photos:** Attach → Picture… a big landscape photo, a portrait one and a PNG with
      transparency; paste one; drop one on the conversation. Each arrives
      dithered at its own shape, at most 320 pixels a side. A file that isn't a
      picture the browser can open says so.
- [ ] **Movies:** Attach → Movie… a phone video, landscape, portrait and square, and
      one longer than ten minutes, which is refused. The timeline shows the
      whole video; drag the window, and its handles (at most 6 s, at least half
      a second); Play loops the part. Make Movie reads and dithers it, then it
      sits above the message box, looping; click it to draw over it (no paint
      bucket), and what you draw stays over every frame. Sent, it loops in the
      other window like a GIF with nothing to press, at its own shape, 2× (1×
      on a phone), repaints in a new theme, and the chat list says "Movie".
      On an iPhone, try one from the camera roll in Safari.
- [ ] **Sounds:** Attach → Sound… then Record: the browser asks for the microphone
      once; speak for a few seconds and Stop (it stops by itself at a
      minute). Choose File… a song (MP3, M4A, and a WAV), and drop one on the
      conversation. The timeline shows the whole of it; drag the window and its
      handles (at most 60 s). Play plays the part squashed, crunchy, exactly as
      it will be sent; Make Sound attaches it above the message box with its
      own Play. Sent, the other window shows Play, the sound's shape and its
      length; Play fills the shape in as it plays and counts up, a click on the
      shape plays from there, and playing another sound stops it. The chat
      list says "Sound", a notification "Sent a sound." On an iPhone, record
      in Safari, and play with the ringer switch both ways: it plays on silent
      too.
- [ ] **Draw on It:** under any picture or movie, opens it in the paint window at its
      size; attaching and sending adds a new message and leaves the original.
- [ ] **Discarding:** Cancel or Esc on a canvas you've drawn on asks "Discard
      this drawing?"; Keep Drawing returns to it.
- [ ] **Drawings and themes:** switch to Dark and a tint; drawings already in
      the chat repaint in the new ink and paper. On a phone they show at 1×,
      and dragging on the canvas draws instead of scrolling.

## 6. Channels

- [ ] **New channel:** File → New Channel… (or New Channel… on the empty
      desktop). Type `Book Club` and you see "Return starts #book-club." Press
      Return and the channel opens.
- [ ] **Add people:** in the channel, File → Add People to Channel… or the Add
      People… button in its info line. Search for Alice and click her: she gets
      a ✓ "In the channel" and the member count goes up. In Alice's window the
      channel appears at the top of her list, with a notification "Test User
      added you to #book-club". Add People… only shows in channels.
- [ ] **Browse:** File → Join Channel… lists channels with member counts and a ✓
      on the ones you've joined. Typing filters the list.
- [ ] **Create:** type `Book Club` and you see "Return starts #book-club." Press
      Return and the channel is created and opened.
- [ ] **Bad name:** `café` or `a/b` shows "Use letters, numbers and dashes, like
      #general".
- [ ] **Join someone else's:** as Alice, click the new channel in the dialog to
      join it. The window's info line shows the member count and names (reopen
      it on the other side to see the update).
- [ ] **Members only:** before joining, Alice sees the channel listed but can't
      read it.
- [ ] **`/join`:** type `/join #random` in any message box. It creates and opens
      the channel instead of sending text. `/join #a/b` shows an inverted error
      line above the box.
- [ ] **Leave:** File → Leave Channel only appears while a channel is open. Use
      it and the channel leaves your list; rejoining brings its history back.
- [ ] **Joins don't reorder:** joining or leaving doesn't bump a channel to the
      top of anyone's list. Only messages do.

## 7. Notifications and alerts

- [ ] **The offer:** in a fresh browser profile, sign in. A dialog offers
      notifications. Not Now closes it, and it doesn't come back after a
      reload. Special → Notifications turns them on; the browser asks, and the
      item gets a ✓. (On macOS the browser itself may also need permission in
      System Settings → Notifications.)
- [ ] **Blocked:** block notifications for the site and try turning them on. A
      dialog explains where to allow them, on a computer and on phones.
- [ ] **Closed:** with notifications on for Test User, close every Msgr tab and
      have Alice write. A direct message shows "Alice Johnson" with the text; a
      channel message shows "Alice Johnson in #general". Clicking it opens
      Msgr at that chat.
- [ ] **No noise:** your own messages, and messages in the chat you have open
      in front, give no notification on any of your devices. Switch tabs and
      they notify again.
- [ ] **Android (Chrome):** open the deployed address, sign in, and Turn On in
      the offer. Lock the phone and have someone write. The notification
      arrives, and tapping it opens the chat.
- [ ] **iPhone (iOS 16.4+):** in Safari, the offer explains Add to Home Screen.
      Do that, open Msgr from the Home Screen, sign in, and Turn On. Lock the
      phone and have someone write. The notification arrives. With the chat
      open in front, messages there don't notify.
- [ ] **Log out:** log out on a device with notifications on, and have someone
      write. Nothing arrives there.
- [ ] **Sound:** Special → Alert Sound is on by default, and turning it on plays
      the beep. Incoming alerts beep too, once you've clicked or typed in the
      page (browsers mute audio until then).
- [ ] **Tab count:** switch to another tab and have Alice send two messages. The
      tab title becomes "(2) Msgr" and resets when you come back.

## 8. Keyboard

- [ ] **Tab** moves through the controls with a visible dashed focus outline.
- [ ] **Menus:** ↑↓ to move, Return to choose, Esc to close.
- [ ] **Dialogs from menus:** a dialog opened from a menu (Join Channel…, New
      Chat…) has its text field focused, so you can type straight away.

## 9. Optional: the production container

This runs it the way Render will: one address, migrations on startup,
security headers.

```bash
docker run -d --name msgr-pg -e POSTGRES_PASSWORD=postgres -p 55432:5432 postgres:18-alpine
docker build -t msgr .
docker run --rm -p 8080:4000 \
  -e DATABASE_URL=postgresql://postgres:postgres@host.docker.internal:55432/postgres \
  -e JWT_SECRET="$(openssl rand -base64 32)" -e CORS_ORIGIN=http://localhost:8080 msgr
# in another terminal:
DATABASE_URL=postgresql://postgres:postgres@localhost:55432/postgres CORS_ORIGIN=http://localhost:8080 npm run invite
```

- [ ] **Empty start:** open the printed link on http://localhost:8080 and sign
      up. The database starts empty, so this is your first account.
- [ ] **Headers:** `curl -I http://localhost:8080` shows
      `Content-Security-Policy`, `X-Frame-Options: DENY` and
      `X-Content-Type-Options: nosniff`.
- [ ] **Cleanup:** `docker rm -f msgr-pg` when you're done.

Invites expiring after 7 days, and codes being stored only as hashes, aren't
practical to check by hand; the automated tests cover them.
