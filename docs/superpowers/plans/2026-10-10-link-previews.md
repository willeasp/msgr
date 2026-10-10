# Link Previews Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Links in messages become underlined links, and the first link in a message gets a card (site, title, description, 64×64 dithered thumbnail) that our server fetched safely.

**Architecture:**

- **Domain:** pure parsing and dithering (`Url`, `firstLink`, `readPreview`, `ditherThumbnail`).
- **Application:** `linkPreviews.forMessage` authorizes through a new `messages.findByIds` and a `LinkPreviewer` port.
- **Infrastructure:** fills the port with a guarded Node `http`/`https` fetcher and `sharp`, behind an in-memory cache.
- **GraphQL:** exposes a root `linkPreview(messageId)`.
- **Frontend:** linkifies text and renders `LinkPreviewCard`.

**Tech Stack:** Node 22 `http`/`https`/`dns`/`net`, `sharp`, Prisma, Apollo, React 19, Vitest, Playwright.

**Spec:** [docs/superpowers/specs/2026-10-10-link-previews-design.md](../specs/2026-10-10-link-previews-design.md)

## Global Constraints

- **Fetcher limits:**
  - `http:`/`https:` only, ports 80/443 only;
  - every resolved address must be public, and the connection uses the checked address;
  - at most 3 redirects, each re-checked;
  - 5 s per request;
  - pages must be `text/html`, read at most 512 KB; pictures must be `image/*`, at most 5 MB;
  - `User-Agent: MsgrLinkPreview/1.0`, no cookies;
  - at most 2 fetches at once;
  - URLs are never logged.
- **Non-public ranges** (verbatim from the spec):
  - **IPv4:** `0/8 10/8 100.64/10 127/8 169.254/16 172.16/12 192.0.0/24 192.0.2/24 192.168/16 198.18/15 198.51.100/24 203.0.113/24 224/4 240/4`;
  - **IPv6:** `:: ::1 fc00::/7 fe80::/10 ff00::/8`, plus IPv4-mapped and `64:ff9b::/96`, judged by the IPv4 inside.
- **`readPreview`:**
  - limits: title 120, site 60, description 200 characters, cut with "…";
  - entities decoded: `&amp; &lt; &gt; &quot; &#39; &#NNN; &#xHH;`.
- **`Url.parse`:** absolute `http:`/`https:` only, at most 2,048 characters.
- **Thumbnail:** 64×64, 512 bytes, in the drawings' bit layout, dithered with Atkinson (ink below 0.5, 1/8 of the error to six neighbours).
- **`sharp`:** `limitInputPixels: 25_000_000`, `failOn: 'error'`, `resize(64, 64, { fit: 'cover' })`, greyscale, raw.
- **Cache:** previews kept 24 h, failures 1 h, at most 500 entries (oldest dropped first), concurrent requests for one URL share a fetch.
- **Layers:** `domain` ← `application` ← `infrastructure`/`graphql`. Resolvers stay one-liners.
- **Frontend links:** `target="_blank" rel="noopener noreferrer"`. Only the first link gets a card.

## Review Focus

- **A page whose `og:image` points at a private address** (e.g. `http://169.254.169.254/…`) gives a card without a thumbnail; nothing is fetched from that address. Test in Task 4: the page links to an image at a blocked host, and the preview's thumbnail is `null`, with the address check called for it.
- **A huge or never-ending page or picture** costs at most its limit in memory and time. Task 4: a 2 MB page is cut at 512 KB, and an image response with a 6 MB `Content-Length` is refused.
- **A message whose link is inside a word or ends with punctuation,** "see https://x.com/a)." links `https://x.com/a`. Tested in Task 1 (`firstLink`) and Task 5 (`splitLinks`).
- **Twenty bubbles with links opening at once** make at most 2 fetches at a time on the server. Task 4: the concurrency test starts 5 previews against a server that counts simultaneous requests and sees at most 2.
- **A link preview for a message the viewer can't see** answers `null` and never fetches. Task 3: the service test asserts the previewer isn't called.

---

### Task 1: Domain: `Url`, `firstLink`, `readPreview`, `ditherThumbnail`

**Files:**

- Create: `apps/api/src/domain/link.ts` and `link.test.ts`, `apps/api/src/domain/link-preview.ts` and `link-preview.test.ts`

**Interfaces (produces):**

```ts
// link.ts
export type Url = Brand<string, 'Url'>;
export const Url: { MAX_LENGTH: 2048; parse(raw: string, base?: string): Url | null };
export function firstLink(text: string): Url | null;
// link-preview.ts
export type Thumbnail = Brand<string, 'Thumbnail'>; // 512 bytes, base64
export interface PagePreview {
  readonly title: string;
  readonly site: string;
  readonly description: string | null;
  readonly image: Url | null;
}
export interface LinkPreview {
  readonly url: Url;
  readonly site: string;
  readonly title: string;
  readonly description: string | null;
  readonly thumbnail: Thumbnail | null;
}
export function readPreview(html: string, page: Url): PagePreview | null;
export const THUMBNAIL_SIZE = 64;
export function ditherThumbnail(grey: Uint8Array): Thumbnail; // grey.length === 64 * 64, 0 black..255 white
```

`Url.parse` returns `null` rather than a `Result`. A link that isn't a URL is not an input error a person must fix; it just isn't previewed.

- [ ] **Step 1: Write the failing tests.**
  - **`link.test.ts`:**
    - `Url.parse`: accepts `https://example.com/a?b#c` and `http://x.org`; rejects `javascript:alert(1)`, `ftp://x`, `/relative`, `example.com`, and 2,049 characters; resolves `'/img.png'` against base `https://example.com/page` to `https://example.com/img.png`.
    - `firstLink`: in `'see https://a.com/x, and https://b.com'` it's `https://a.com/x`; `'(https://a.com/x)'` gives `https://a.com/x`; `'https://en.wikipedia.org/wiki/Foo_(bar)'` keeps the `)`; `'no links'` gives `null`; `'https://a.com/x).'` gives `https://a.com/x`.
  - **`link-preview.test.ts`:**
    - `readPreview` reads `og:title`, `og:site_name`, `og:description` and a relative `og:image`. Attributes come in either order (`content` first or second) and with either quote style.
    - It falls back to `<title>`, then to `<meta name="description">`, then to the host without `www.` for `site`.
    - It decodes `&amp; &#39; &#x27; &quot;` and collapses whitespace.
    - It cuts a 300-character title to 120 characters ending in "…".
    - It returns `null` for a page without any title.
    - An `og:image` with a `javascript:` URL gives `image: null`.
    - `ditherThumbnail`: all 255 gives 512 zero bytes; all 0 gives 512 `0xFF`; all 128 gives between 40% and 60% ink bits; the output base64 decodes to 512 bytes.
- [ ] **Step 2:** Run `npx nx test @msgr/api -- src/domain/link`, and watch it fail because the modules are missing.
- [ ] **Step 3: Implement.** The essentials:

```ts
// link.ts
const LINK = /https?:\/\/[^\s<>"]+/gi;
const TRAILING = /[.,!?;:'"]+$/;
/** Trims trailing punctuation, and a closing parenthesis the link didn't open. */
function trimLink(candidate: string): string {
  let link = candidate.replace(TRAILING, '');
  while (link.endsWith(')') && (link.match(/\(/g)?.length ?? 0) < (link.match(/\)/g)?.length ?? 0)) {
    link = link.slice(0, -1).replace(TRAILING, '');
  }
  return link;
}
export function firstLink(text: string): Url | null {
  for (const [candidate] of text.matchAll(LINK)) {
    const url = Url.parse(trimLink(candidate));
    if (url) return url;
  }
  return null;
}
```

`Url.parse` does `new URL(raw, base)` inside try/catch. It requires `protocol` to be `http:` or `https:` and `href.length <= 2048`, and returns `href` as `Url`.

```ts
// link-preview.ts, reading <meta> tags
const META = /<meta\b[^>]*>/gi;
const ATTRIBUTE = /([a-z:-]+)\s*=\s*("([^"]*)"|'([^']*)')/gi;
function metaTags(html: string): Map<string, string> {
  const tags = new Map<string, string>();
  for (const [tag] of html.matchAll(META)) {
    const attributes = new Map<string, string>();
    for (const m of tag.matchAll(ATTRIBUTE)) attributes.set(m[1]!.toLowerCase(), m[3] ?? m[4] ?? '');
    const key = (attributes.get('property') ?? attributes.get('name'))?.toLowerCase();
    const content = attributes.get('content');
    if (key && content !== undefined && !tags.has(key)) tags.set(key, content);
  }
  return tags;
}
```

Entities are decoded with a map for the named ones plus `&#(\d+);` and `&#x([0-9a-f]+);`. `cut(text, max)` returns `text.length > max ? text.slice(0, max - 1) + '…' : text`. `ditherThumbnail` runs Atkinson over `grey[i] / 255` and packs `0x80 >> (x & 7)` into `bytes[y * 8 + (x >> 3)]`, base64 by `Buffer.from(bytes).toString('base64')`.

`Buffer` in the domain: the API's domain already relies on Node globals only through `atob`/`btoa`. Use `btoa(String.fromCharCode(...bytes))` to stay web-standard.

- [ ] **Step 4:** Run the tests and watch them pass.

---

### Task 2: `messages.findByIds` and `loaders.message`

**Files:**

- Modify: `apps/api/src/application/ports.ts` (the `MessageRepository` gains `findByIds(ids: readonly MessageId[]): Promise<Message[]>`)
- Modify: `apps/api/src/application/loaders.ts` (`message: DataLoader<MessageId, Message | null>` via `byId`)
- Modify: `apps/api/src/testing/repository-contract.ts`, `apps/api/src/testing/in-memory-repositories.ts`, `apps/api/src/infrastructure/prisma/message.repository.ts`

- [ ] **Step 1: The failing contract test,** in `describe('messages')`: "finds messages by id, text and drawings alike, and skips unknown ids". Send a text and a drawing, then `findByIds([drawing.id, text.id, MessageId('missing')])`. Sorted by id, the result equals `[text, drawing]` sorted by id.
- [ ] **Step 2:** `npx nx test @msgr/api -- src/testing`. It fails because `findByIds` is not a function.
- [ ] **Step 3:**
  - **In-memory:** `findByIds: async (ids) => messages.filter((message) => ids.includes(message.id))`.
  - **Prisma:** `db.message.findMany({ where: { id: { in: [...ids] } }, select: messageFields })` mapped through `toMessage`.
  - **The loader:** `message: byId((ids) => messages.findByIds(ids), cache)`.
- [ ] **Step 4:** Run all API tests, then the Postgres contract against `msgr-test-pg` (`TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:55432/msgr_test`).

---

### Task 3: The `LinkPreviewer` port, `linkPreviews.forMessage`, and GraphQL

**Files:**

- Modify: `apps/api/src/application/ports.ts`: `export interface LinkPreviewer { preview(url: Url): Promise<LinkPreview | null> }`, and `Dependencies` gains `readonly linkPreviewer: LinkPreviewer`.
- Create: `apps/api/src/application/link-preview.service.ts` and `link-preview.service.test.ts`
- Modify: `apps/api/src/application/scope.ts` (`services.linkPreviews`), `apps/api/src/testing/harness.ts` (default fake), `apps/api/src/main.ts` (wired in Task 4; until then the temporary `{ preview: async () => null }`)
- Modify: `apps/api/src/graphql/schema.ts`, `resolvers.ts`, `codegen.ts` (`LinkPreview` mapper → `../../domain/link-preview.js#LinkPreview`), `resolvers.test.ts`

**Interfaces:**

- Produces: `linkPreviews.forMessage(viewer: User, messageId: string): Promise<LinkPreview | null>`. In the harness, `fakeLinkPreviewer(previews: Record<string, LinkPreview> = {})` returns a previewer that looks up by URL and returns `null` otherwise.

- [ ] **Step 1: Failing tests.**
  - **Service:**
    - A text message "look https://a.com/x!" in a chat Ada is in → returns the fake's preview for `https://a.com/x`.
    - Linus, not in the chat, gets `null`.
    - A drawing message gives `null`.
    - Text without a link gives `null`.
    - An unknown id gives `null`.
    - For each `null` case, a `vi.fn` previewer was not called.
  - **Resolvers:** `query ($id: ID!) { linkPreview(messageId: $id) { url site title description thumbnail } }` returns the fake's preview.
- [ ] **Step 2:** Run them and watch them fail.
- [ ] **Step 3: Implement.**

```ts
export function createLinkPreviewService({ linkPreviewer }: Dependencies, loaders: Loaders) {
  return {
    /** A card for the first link in a message the viewer can see; null for any other. */
    async forMessage(viewer: User, messageId: string): Promise<LinkPreview | null> {
      const message = await loaders.message.load(MessageId(messageId));
      if (!message || message.kind !== 'text') return null;
      const chat = visibleTo(await loaders.chat.load(message.chatId), viewer.id);
      if (!chat.ok) return null;
      const url = firstLink(message.content);
      return url && linkPreviewer.preview(url);
    },
  };
}
```

- **Schema:**

  - the `LinkPreview` type as in the spec;
  - `linkPreview(messageId: ID!): LinkPreview` on `Query`;
  - the resolver `linkPreview: (_, { messageId }, ctx) => ctx.services.linkPreviews.forMessage(requireViewer(ctx), messageId)`.

  Run `npm run codegen`.

- [ ] **Step 4:** Run the API suite and typecheck.

---

### Task 4: The fetcher, the cache, and wiring

**Files:**

- Create:
  - `apps/api/src/infrastructure/public-address.ts` and `.test.ts`;
  - `apps/api/src/infrastructure/link-previewer.ts` and `.test.ts`;
  - `apps/api/src/infrastructure/cached-link-previewer.ts` and `.test.ts`.
- Modify: `apps/api/package.json` (`sharp`), `apps/api/src/main.ts`

**Interfaces:**

- Produces:
  - `isPublicAddress(address: string): boolean`;
  - `createLinkPreviewer(options?: { isAllowed?: (address: string) => boolean; timeoutMs?: number }): LinkPreviewer`;
  - `cachedLinkPreviewer(inner: LinkPreviewer, clock: Clock, options?: { maxEntries?: number }): LinkPreviewer`.
- Consumes: `readPreview`, `ditherThumbnail`, `THUMBNAIL_SIZE`, `Url` from Task 1, and the `LinkPreviewer`/`Clock` ports.

- [ ] **Step 1: Install `sharp`.** Run `npm --workspace=@msgr/api install sharp`, then check the production image builds and decodes: `docker build -t msgr-sharp-check .`, then `docker run --rm --entrypoint node msgr-sharp-check -e "require('sharp')"`.
- [ ] **Step 2: `public-address.ts`, test first.** Each listed range gives `false`; `8.8.8.8`, `1.1.1.1` and `2606:4700:4700::1111` give `true`; `::ffff:127.0.0.1`, `::ffff:7f00:1` and `64:ff9b::a00:1` give `false`; garbage gives `false`. The implementation is Node's `net.BlockList` with `addSubnet` for each range, plus mapped and NAT64 handling: parse the last 32 bits into dotted IPv4 and check that.
- [ ] **Step 3: `link-previewer.ts`, test first,** against `http.createServer` on `127.0.0.1` with `isAllowed: () => true`, unless a test says otherwise:
  - a page with `og:` tags and an `og:image` of a 200×100 PNG made in the test with `sharp({ create: … })` gives a preview whose thumbnail decodes to 512 bytes;
  - the 3 redirects 302 → 302 → 302 → page are followed, and a 4th redirect gives `null`;
  - `isAllowed` is called for every hop, which a counting spy checks;
  - a page that never ends times out at `timeoutMs: 200` with `null`;
  - a 2 MB page whose tags sit in its first KB gives a preview, and fewer than 600 KB were sent before the socket closed;
  - `Content-Type: application/json` gives `null`;
  - a broken image gives a preview with `thumbnail: null`;
  - an image with `Content-Length: 6000000` gives `thumbnail: null`;
  - an `og:image` at a host `isAllowed` refuses gives `thumbnail: null` (Review Focus);
  - with the default `isAllowed`, the local server is refused and the result is `null`;
  - 5 concurrent previews against a server that counts open requests see at most 2 at a time.
- [ ] **Step 4: Implement `link-previewer.ts`.** The essentials:

```ts
function guardedLookup(isAllowed: (address: string) => boolean): LookupFunction {
  return (hostname, options, callback) => {
    dns.lookup(hostname, { all: true }, (error, addresses) => {
      if (error) return callback(error, '', 0);
      if (addresses.length === 0 || addresses.some(({ address }) => !isAllowed(address))) {
        return callback(new Error('Refused address'), '', 0);
      }
      // Node asks for all addresses when it races IPv4 and IPv6.
      if (options.all) return callback(null, addresses);
      const [first] = addresses;
      callback(null, first!.address, first!.family);
    });
  };
}
```

- **`get(url, accept, maxBytes)`:**
  - It checks scheme and port, and checks IP literals with `isAllowed` directly.
  - It calls `(url.protocol === 'https:' ? https : http).get(url, { lookup, headers, signal: AbortSignal.timeout(timeoutMs), agent: false })`.
  - A 3xx with a `Location` recurses, with a hop count of at most 3.
  - It rejects when the `Content-Type` doesn't match `accept`, or when `Content-Length` exceeds `maxBytes`.
  - It collects chunks until `maxBytes`, then destroys the response and resolves with what it has (the page reading is still useful).
- **`preview(url)`:**

  1. `get(url, 'text/html', 512 KB)`;
  2. `readPreview(body.toString('utf8'), finalUrl)`;
  3. if there's an image, `get(image, 'image/', 5 MB)`;
  4. `sharp(bytes, { limitInputPixels: 25_000_000, failOn: 'error' }).resize(64, 64, { fit: 'cover' }).greyscale().raw().toBuffer()`;
  5. `ditherThumbnail(new Uint8Array(raw))`.

  Everything is in `try`/`catch`. A failure before the text means `null`; a failure after it means a preview without a thumbnail.

- **Concurrency:** a small queue of at most 2 running `preview` calls.
- [ ] **Step 5: `cached-link-previewer.ts`, test first.** With a fake clock and a counting inner previewer:

  - the same URL twice within 24 h is fetched once, and fetched again after 24 h;
  - a `null` is fetched again after 1 h;
  - with `maxEntries: 2`, a 3rd URL drops the 1st;
  - two concurrent calls share one inner call.

  The implementation is a `Map<Url, { at: number; result: Promise<LinkPreview | null> }>`. Insertion order gives oldest-first eviction, and re-setting a key moves it to the end.

- [ ] **Step 6: Wire it.** `main.ts` gets `linkPreviewer: cachedLinkPreviewer(createLinkPreviewer(), clock)`. Then run the API suite, typecheck and lint.

---

### Task 5: Frontend: links, the card, and the e2e

**Files:**

- Create:
  - `apps/frontend/src/lib/links.ts` and `.test.ts`;
  - `apps/frontend/src/app/components/chat/LinkPreviewCard.tsx` and `.module.css`;
  - `apps/e2e/tests/links.spec.ts`.
- Modify: `apps/frontend/src/app/components/chat/MessageBubble.tsx`, `apps/frontend/src/app/components/icons.ts` (`DOCUMENT`, 16×16)

**Interfaces:**

- Produces:

  - `splitLinks(text): ({ text: string } | { link: string })[]`;
  - `firstLink(text): string | null`;
  - `LinkPreviewCard({ messageId })`.

- [ ] **Step 1: The failing e2e (`links.spec.ts`).**
  - Before sending, `page.route('**/graphql', …)` answers requests whose JSON body has `operationName === 'LinkPreview'` with a fixed preview. The fixture is site "Example", title "An example page", a description, and a checkerboard thumbnail (512 bytes of `0xAA`/`0x55`). Every other request is passed through with `route.fallback()`.
  - Test User sends "look at https://example.com/page." to Charlie Brown, who also routes. Then:
    - in both windows the bubble has a link named "https://example.com/page" with `target="_blank"` and a `rel` containing `noopener`;
    - a link with the accessible name "Example An example page …" (the card) is visible, and its thumbnail is 64 px wide;
    - a second message "and https://example.com/none", answered with `null`, has a link and no card.
- [ ] **Step 2: `lib/links.ts`, test first.**
  - the trailing punctuation and parentheses cases as in Task 1;
  - "a https://x.com b" gives three pieces;
  - no links gives one text piece.
- [ ] **Step 3: The bubble.** For text messages, `MessageBubble` renders `splitLinks(content)`:

  - each link as `<a className={styles.link} href target="_blank" rel="noopener noreferrer">`;
  - each run as `<PixelText>`;
  - `.link { color: inherit; text-decoration: underline; overflow-wrap: anywhere; }`.

  When `firstLink(content)` is non-null, `<LinkPreviewCard messageId={message.id} />` goes under the bubble, in the meta row, aligned like Draw on It.

- [ ] **Step 4: `LinkPreviewCard`.**
  - It queries `query LinkPreview($messageId: ID!) { linkPreview(messageId: $messageId) { url site title description thumbnail } }` and renders nothing until the data arrives, or when it's `null`.
  - The card is an `<a href={url} target="_blank" rel="noopener noreferrer">` with:
    - the thumbnail, a `span` masked with an SVG made by `pixelPath` from the bits turned into rows, 64×64 CSS px, `background: currentColor`;
    - or `<PixelIcon bitmap={DOCUMENT} scale={2} />`;
    - and the site, title and description through `PixelText`.
  - CSS per the spec: 1 px ink border, 2 px shadow, `max-width: 340px`, the description clamped to 2 lines, and a 2px offset of the meta inset.
- [ ] **Step 5:** Run `npm run typecheck && npm run lint && npm run test && npm run e2e`; all pass. Screenshot a card in light and dark, and look at them.

---

### Task 6: Docs, the full check, push

- [ ] **Docs:**
  - **SECURITY.md:** a "Link previews" section with every guard from the Global Constraints, and why: SSRF against Render's and Neon's internal networks, and DNS rebinding.
  - **CLAUDE.md:** `links` joins the `lib/` list, plus a Gotchas line: "Link previews are fetched by `infrastructure/link-previewer.ts` behind `isPublicAddress`; tests pass their own `isAllowed`. Never loosen the default."
  - **manual-testing.md:** section 5 bullets for links and cards.
  - **CONTEXT.md:** the **Link preview** term.
- [ ] **Run everything:** `npm run typecheck && npm run lint && TEST_DATABASE_URL=… npm run test && npm run e2e`, plus a production image build.
- [ ] **Review and push:** the final review, then push and watch CI and the deploy. Then try a real link on the live site with a signed-in session, if the user does it.
