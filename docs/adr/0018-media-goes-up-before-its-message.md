# 18. A message's media goes up before it, to its own address

Date: 2026-10-27 · Status: accepted

## Context

ADR 12 gave every picture, movie and sound an address, so their bytes reach
a reader once, and never inside the JSON. Sending still carried them inside:
`sendMessage` took each as base64 (`PictureInput.bits` and the others), a
third bigger than the bytes, in a body of up to 1 MB that the server parsed
as JSON, and the JavaScript string it made, before it could look at any of
it. The bytes and the message were one request, so nothing about the bytes
could be said, or checked, apart from the message.

## Decision

- **The bytes go first, raw, to the address they'll be read from.** Before
  sending a message with a picture, movie or sound, the client `PUT`s its
  bytes, exactly as `url` would serve them, to `/media/:id/picture|movie|sound`
  under the message's own id (the one its sender chose, ADR 16), its size in
  the query: `?width=&height=` for a picture, `&frames=` too for a movie, and
  `?frames=` for a sound. Then `sendMessage` names what it carries
  (`SendMessageInput.uploaded`), and holds only words and ids.
- **An upload is checked once, as it arrives** (`Upload.parse`): the same
  checks a picture, movie or sound always had (`Picture.parseBytes` and the
  others), on the bytes rather than on base64. The server asks for the
  session first (401 without one), then reads at most the largest any upload
  may be (`MAX_UPLOAD_BYTES`, the biggest movie, about 0.7 MB), refusing a
  longer body before reading it (413). A refusal of what was put is a 422
  whose body is the reason, which Not Sent. shows, as it does the server's
  reason for refusing a message.
- **An upload belongs to its uploader, until its message takes it.** It's
  kept under the message's id (`UploadRepository`, the `Upload` table, one
  row each, its CHECK the same as a message's media). Putting it again
  replaces it, so Try Again puts it again without asking whether the last
  put arrived. Putting it under an id that someone else's upload holds, or
  that a stored message holds, is refused as taken ("That message id is
  taken", as a send says it), unless the message is the uploader's own with
  that part: then it answers 204 at once, decoding nothing, and nothing
  changes, so a Try Again after a lost answer goes on to the send, which
  answers with the stored message. Nobody can fetch an upload: its address
  answers 404 until the message is stored, and the sender's device shows its
  own copy meanwhile.
- **A message takes its upload as it's stored.** `MessageRepository.append`
  stores the message with the upload's bytes and forgets the upload in one
  transaction. A send that names an upload checks it only after the chat,
  so a chat you're not in still answers as missing; one its sender doesn't
  have says so ("Upload it before sending it"), unless its message is
  stored already, which answers as any send under a stored id does. An
  upload whose message never comes is forgotten an hour after it was put
  (`UPLOAD_KEPT_MS`), swept by the next upload anyone puts, and nobody keeps
  more than their 10 newest (`UPLOADS_KEPT_EACH`): a page sends one message
  at a time per chat, and nobody can fill the database with uploads no chat
  shows.
- **The upload's address is the API's, like `/graphql`.** The client builds
  it only to put, from the id it chose; it still reads only from `url`, which
  stays opaque. If media moves to object storage (ADR 12), uploads still come
  through here: only the server can check them (ADRs 7 and 8).
- **Puts are from this site alone.** The session cookie is `SameSite=Lax` and
  a `PUT` from another site needs a preflight nobody answers, so no other
  site can put; the server also refuses a browser whose `Origin` is neither
  `CORS_ORIGIN` nor the address it asked (403), so a phone trying
  `npm run dev` over the network still can.
- An avatar still goes in `updateProfile`: 64×64 pixels, at most 1 KB, its
  address named by its contents rather than an id that exists before it.
- `SendMessageInput.picture`, `movie` and `sound` stay, deprecated, for a
  release, as ADR 11 asks: a kept shell one version behind still sends
  them, and is served as before.

## Consequences

- A send is a put and then a mutation: one more request for a message with
  media, none more for words. Each is bounded on its own: a put asks for one
  movie's worth of work, as a mutation does.
- Try Again after a send whose bytes arrived sends them again: the client
  doesn't know they arrived, and a put that replaces an upload is cheap
  beside a person's waiting. What it saves is the base64.
- The JSON body limit stays 1 MB while the deprecated inputs do; once they're
  removed it can drop to what 4,000 characters and an avatar take.
- An abandoned upload holds its bytes for up to an hour, and nobody ever
  sees it.
- A shell newer than its server (a rollback) puts to an address the old
  server doesn't take: every send with media says Not Sent. until the shell
  updates, as ADR 16 found for ids.
