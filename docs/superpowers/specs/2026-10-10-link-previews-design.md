# Link previews

_Design, agreed 2026-10-10. The third old-school project, after drawings and pixel emoji._

## Goal

Links in messages become underlined links, and the first link in a message gets a small card under its bubble: the site's name, the page's title, two lines of description, and the page's picture dithered to a 64×64 thumbnail, like a Finder icon. A page without a picture gets a document icon instead.

Our server fetches the pages. A browser can't: other sites don't let JavaScript on our page read their responses (CORS), nor read the pixels of their images, and fetching from every reader's browser would show each linked site the reader's IP address. That is also how Slack and Discord do it.

## Scope

In:

- Clickable links in message text.
- One card per message, for its first `http(s)` link.
- A server-side fetcher with SSRF guards.
- Thumbnails dithered on the server.
- An in-memory cache.

Out:

- Previews in the chat list or in notifications.
- oEmbed and video players.
- Previews of drawings.
- A database cache. In memory is enough for now; previews are fetched again after the free plan's app wakes up.
- Letting people turn previews off.

## Links in text (frontend)

- `lib/links.ts`, with a test, has `splitLinks(text)`, which cuts text into plain runs and links.
  - A link starts with `http://` or `https://` and runs to the next whitespace, `<` or `"`.
  - Trailing `. , ! ? ; : ' "` are left out, and so is a trailing `)` that has no `(` in the link.
  - It also has `firstLink(text)`, which is used to decide whether to ask for a preview at all.
- `MessageBubble` renders links as `<a href target="_blank" rel="noopener noreferrer">`, underlined in the text's colour. Plain runs still go through `PixelText`.

## The API

### Domain (`domain/link.ts`, `domain/link-preview.ts`)

- `Url` is a brand. `Url.parse(raw)` accepts absolute `http:` and `https:` URLs up to 2,048 characters, and nothing else.
- `firstLink(content: MessageContent): Url | null` follows the same link rule as the frontend.
- `readPreview(html: string, page: Url): PagePreview | null` is a pure function. It reads `<meta>` tags with a forgiving regex: attributes in any order, single or double quotes, and `property` or `name`. It returns:
  - **`title`:** `og:title`, then `<title>`. No title means no preview: `null`.
  - **`site`:** `og:site_name`, then the page's host without `www.`.
  - **`description`:** `og:description`, then `description`, or `null`.
  - **`image`:** `og:image`, resolved against the page's URL, if it parses as a `Url`; otherwise `null`.
  - Entities (`&amp; &lt; &gt; &quot; &#39; &#NNN; &#xHH;`) are decoded, codes that aren't characters become `�`, and whitespace is collapsed. Title, site and description are cut to 120, 60 and 200 characters, with "…".
- `ditherThumbnail(grey: Uint8Array): Thumbnail` takes 64×64 greyscale bytes and returns 512 bytes. The layout is the drawings' (rows top to bottom, 8 pixels a byte, leftmost in the high bit, 1 is ink), and the dithering is the emoji's Atkinson: ink below half, an eighth of the error to each of six neighbours.
- `LinkPreview = { url: Url; site; title; description: string | null; thumbnail: Thumbnail | null }`.

### Application

- **A new port, `LinkPreviewer`:** `preview(url: Url): Promise<LinkPreview | null>`. It never throws: every failure is `null`.
- **A new repository method, `messages.findByIds(ids)`:** batch-shaped like the others. It goes into the repository contract and both adapters, with a `loaders.message` DataLoader.
- **`linkPreviews.forMessage(viewer, messageId)`:** loads the message and checks the viewer can see its chat (`visibleTo`). It returns `null` in each of these cases:

  - the message is missing, or in someone else's chat (a chat you're not in answers like a missing one);
  - it's a drawing;
  - it has no link.

  Otherwise it returns `previewer.preview(firstLink(content))`. So the server only ever fetches links that someone posted in a chat the asker is in, and it can't be used as a general fetching proxy.

### GraphQL

```graphql
type LinkPreview {
  url: String!
  "The site's name, e.g. Wikipedia."
  site: String!
  title: String!
  description: String
  "The page's picture as a 64×64 black-and-white thumbnail: rows top to bottom, 8 pixels a byte with the leftmost in the high bit, 1 for ink, in base64. Null without one."
  thumbnail: String
}

# Query
"A card for the first link in a message the viewer can see, or null."
linkPreview(messageId: ID!): LinkPreview
```

This is a root field, so a chat's history never waits on a slow site. Each bubble with a link asks for its own card.

### The fetcher (`infrastructure/link-previewer.ts`)

Node's own `http`/`https`, no fetch library. Every request goes through the same guarded `get`:

- **Scheme and port:** `http:` and `https:` only, on ports 80 and 443 only.
- **Addresses:** a custom `lookup` resolves every address for the host (`dns.lookup` with `all: true`). The request is refused if any address is not public, and the connection uses the checked address, so a second DNS answer can't swap it (rebinding). IP-literal hosts are checked directly. Addresses that aren't public:
  - **IPv4:** `0/8`, `10/8`, `100.64/10`, `127/8`, `169.254/16`, `172.16/12`, `192.0.0/24`, `192.0.2/24`, `192.168/16`, `198.18/15`, `198.51.100/24`, `203.0.113/24`, `224/4` and `240/4`;
  - **IPv6:** `::`, `::1`, `fc00::/7`, `fe80::/10` and `ff00::/8`, plus IPv4-mapped and NAT64 (`64:ff9b::/96`) addresses, judged by the IPv4 inside.
- **Redirects:** at most 3, each hop going through the same checks.
- **Limits:**
  - 5 seconds per request.
  - Pages must be `text/html`; at most the first 512 KB is read, then the connection is closed.
  - Pictures must be `image/*`, at most 5 MB.
- **Headers:** `User-Agent: MsgrLinkPreview/1.0`, `Accept: text/html` for pages and `image/*` for pictures, and no cookies.
- **The thumbnail:** `sharp`, a new dependency of `@msgr/api`, decodes JPEG, PNG, WebP, AVIF and GIF. Anything else, SVG and TIFF included, is refused after reading only the picture's header.
  - It runs with `limitInputPixels: 4_000_000` and `failOn: 'error'`, with its cache off and one thread: a 1 KB AVIF can claim 5000×5000 pixels, and decoding two of those would take more than the instance's 512 MB. Social cards are about 1200×630, under 1 megapixel.
  - It is resized to 64×64 with `fit: 'cover'`, made greyscale, and read out as raw bytes, which go to `ditherThumbnail`.
  - If the picture can't be fetched or decoded, the preview has no thumbnail; it still has its text.
- **Concurrency:** at most 2 fetches at once across the server; the rest wait. This keeps image decoding inside the free instance's 512 MB.
- **Privacy:** URLs are never logged.

### The cache (`infrastructure/cached-link-previewer.ts`)

This decorator wraps any `LinkPreviewer`. It keeps:

- previews for 24 hours, and failures (`null`) for 1 hour;
- at most 500 entries, dropping the oldest first.

Two requests for the same URL at once share one fetch. The clock is the app's `Clock`.

`main.ts` wires `cachedLinkPreviewer(createLinkPreviewer(), clock)`. The tests wire an in-memory fake.

## The card (frontend)

`LinkPreviewCard({ messageId })` renders under a bubble whose text has a link, aligned like the sender's name over it.

- It queries `linkPreview(messageId)` and renders nothing while loading or when the result is `null`.
- The card is one `<a>` to the link (new tab, `noopener noreferrer`), framed like the paint window's buttons: 1 px ink border, 2 px offset shadow, paper background.
- **On the left:** the thumbnail at 64×64 CSS px in `--ink`, drawn as a mask from the bits with `pixelPath`, or a 16×16 document icon at 2× when there's none.
- **On the right:**

  - the site in Chicago, 13 px;
  - the title in Chicago, 15 px;
  - the description in Departure Mono, 13 px, cut to two lines.

  All three go through `PixelText`.

- At most 340 px wide, and the full width on a phone.

## Errors

- **Anything a site can do wrong yields no card, never an error:**

  - unreachable, slow or too big;
  - not HTML, or no title;
  - a blocked address, or too many redirects;
  - a broken picture, which only loses the thumbnail.

  The link itself always works.

- **A message you can't see is a `null` preview,** the same as one without a link.
- **A defect in our own code still throws,** as everywhere else.

## Testing

- **`domain/link.test.ts`:**
  - `Url.parse` accepts http(s) and rejects `javascript:`, `ftp:`, relative URLs and over-long ones.
  - `firstLink` finds the first link, drops trailing punctuation and an unbalanced `)`, and returns `null` without one.
- **`domain/link-preview.test.ts`:**
  - `readPreview` reads `og:` tags in any attribute order and quote style.
  - It falls back to `<title>`, the description meta tag and the host.
  - It decodes entities, resolves a relative `og:image`, and cuts long fields.
  - It returns `null` without a title.
- **Thumbnail dithering:**
  - all white gives 512 zero bytes, and all black gives 512 `0xFF` bytes;
  - a 50% grey comes out roughly half ink, between 40% and 60%.
- **Public addresses (`infrastructure/public-address.test.ts`):** each blocked range above is refused, as are IPv4-mapped and NAT64 forms of private addresses. `8.8.8.8` and `2606:4700:4700::1111` are allowed.
- **The fetcher (`infrastructure/link-previewer.test.ts`),** against a local HTTP server, with the address check passed in so it can allow `127.0.0.1`:
  - it reads a page's preview, and its picture becomes a thumbnail (a PNG made with `sharp` in the test);
  - redirects are followed up to 3, and the 4th fails;
  - each redirect hop is checked again;
  - a slow page times out;
  - a large page is cut at 512 KB and still read, if its tags come first;
  - non-HTML gives `null`, and a broken picture gives a preview without a thumbnail;
  - with the real address check, the local server is refused.
- **The cache:**
  - a second request within 24 hours doesn't fetch, and a failure is retried after 1 hour;
  - the 501st URL drops the oldest;
  - concurrent requests share a fetch.
- **Service and contract:**
  - `messages.findByIds` returns what exists, from both adapters.
  - `forMessage` returns `null`, without calling the previewer, for someone else's chat, a drawing, or text without a link.
  - Otherwise it passes the first link through.
- **GraphQL:** `linkPreview(messageId)` returns the fields and the thumbnail in base64.
- **Browser (`apps/e2e/tests/links.spec.ts`):** a message with a link shows it as an underlined link that opens in a new tab.
  - The test intercepts the `LinkPreview` GraphQL request with `page.route` and answers with a fixed preview. The card then shows the site, the title and a 64×64 thumbnail, and clicking it opens the link.
  - A `null` answer shows no card.
  - CI never fetches real sites.
- **README pictures:** unchanged; the seed has no links.

## Docs

- SECURITY.md gets a section on the fetcher's guards.
- CLAUDE.md gets one line on the `LinkPreviewer` port, and `links` joins the `lib/` list.
- manual-testing.md gets bullets for links and cards.
- CONTEXT.md gets **Link preview**: "The card under a message for the first link in it: the page's site, title, description and a dithered thumbnail, as our server read it."
