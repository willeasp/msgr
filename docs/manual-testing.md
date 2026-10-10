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
- [ ] **Spent link:** open the same link again and submit. "This invite has been
      used or has expired. Ask for a new one."
- [ ] **Made-up link:** go to `localhost:4200/invite/whatever` and submit. Same
      message.
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

- [ ] **Turn them on:** Special → Notifications. The browser asks for
      permission; allow it and the item gets a ✓. (On macOS the browser itself
      may also need permission in System Settings → Notifications.)
- [ ] **Blocked:** block notifications for localhost in the site settings and
      try turning them on. A dialog explains where to allow them.
- [ ] **Desktop notification:** with Test User on the empty desktop or another
      chat, have Alice write. A direct message shows "Alice Johnson" with the
      text; a channel message shows "Alice Johnson in #general". Clicking the
      notification brings the window forward and opens that chat.
- [ ] **No noise:** your own messages, and messages in the chat you're looking at
      (tab in front), give no beep or notification.
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
