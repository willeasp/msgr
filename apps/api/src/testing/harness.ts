import type {
  Clock,
  Dependencies,
  Giphy,
  InviteCodes,
  LinkPreviewer,
  PasswordHasher,
  PushSender,
  StorageGauge,
} from '../application/ports.js';
import type { StorageUsage } from '../domain/storage.js';
import { GIF_PAGE, type Gif, type GifOffset } from '../domain/gif.js';
import type { LinkPreview } from '../domain/link-preview.js';
import type { Notification, PushSubscription } from '../domain/push.js';
import { createScope } from '../application/scope.js';
import type { InviteCode } from '../domain/invite.js';
import { ok, type Result } from '../domain/result.js';
import type { PasswordHash } from '../domain/user.js';
import { createPubSubChatEvents } from '../infrastructure/chat-events.js';
import { createPubSubProfileEvents } from '../infrastructure/profile-events.js';
import { createPubSubTypingEvents } from '../infrastructure/typing-events.js';
import { createPubSubMessageEvents } from '../infrastructure/message-events.js';
import { createMemoryThrottle } from '../infrastructure/throttle.js';
import { createJwtTokenService } from '../infrastructure/token-service.js';
import { createMemoryWatching } from '../infrastructure/watching.js';
import { zlibPictureCodec } from '../infrastructure/zlib-picture-codec.js';
import { createInMemoryRepositories } from './in-memory-repositories.js';

export const TEST_JWT_SECRET = 'test-secret-that-is-at-least-32-characters';

/** A hasher without bcrypt's cost: the "digest" is just a prefixed password. */
export const fakeHash = (password: string) =>
  `fake-hash:${password}` as PasswordHash;
export const fakePasswordHasher: PasswordHasher = {
  hash: async (password) => fakeHash(password),
  verify: async (password, hash) => hash === fakeHash(password),
};

/** Previews only these pages, without fetching anything; null for any other. */
export const fakeLinkPreviewer = (
  previews: readonly LinkPreview[] = []
): LinkPreviewer => ({
  preview: async (url) => previews.find((known) => known.url === url) ?? null,
});

/**
 * GIPHY with only these GIFs, trending in this order, found by words in
 * their titles, a page at a time; each file is its own address's text.
 */
export const fakeGiphy = (gifs: readonly Gif[] = []): Giphy => ({
  search: async (words, offset) => {
    const found = gifs.filter(
      ({ title }) => !words || title.toLowerCase().includes(words.toLowerCase())
    );
    const next = offset + GIF_PAGE;
    return ok({
      gifs: found.slice(offset, next),
      next: next < found.length ? (next as GifOffset) : null,
    });
  },
  file: async (url) =>
    gifs.some(({ still, movie }) => url === still || url === movie)
      ? {
          type: new URL(url).pathname.endsWith('.mp4')
            ? 'video/mp4'
            : 'image/gif',
          length: url.length,
          body: (async function* () {
            yield new TextEncoder().encode(url);
          })(),
        }
      : null,
});

/** The key the test app hands browsers, as a server with push on would. */
export const TEST_PUSH_KEY = `B${'k'.repeat(86)}`;

/** A browser subscribed at Google's push service: `fakeBrowser('ada-phone')`. */
export const fakeBrowser = (name: string) =>
  ({
    endpoint: `https://fcm.googleapis.com/fcm/send/${name}`,
    p256dh: 'a'.repeat(87),
    auth: 'a'.repeat(22),
  } as PushSubscription);

/** Records every push instead of sending it; answers 'gone' for the endpoints in `gone`. */
export function recordingPushSender(gone: readonly string[] = []) {
  const sent: {
    endpoint: string;
    notification: Notification;
    unread: number | null;
  }[] = [];
  const sender: PushSender = {
    send: async ({ endpoint }, { notification, unread }) => {
      sent.push({ endpoint, notification, unread });
      return gone.includes(endpoint) ? 'gone' : 'sent';
    },
  };
  return { sender, sent };
}

/** Measures the same database every time; an empty one by default. */
export const fakeStorageGauge = (
  usage: StorageUsage = { databaseBytes: 0, tables: [], contents: [] }
): StorageGauge => ({ measure: async () => usage });

/** Valid, predictable invite codes: `invite0000000000000001`, then `…02`. */
export function sequentialInviteCodes(): InviteCodes {
  let issued = 0;
  return () => `invite${String(++issued).padStart(16, '0')}` as InviteCode;
}

/** Starts at `start` and advances one second per reading, so ordering is deterministic. */
export function tickingClock(
  start = new Date('2030-01-01T00:00:00.000Z')
): Clock {
  let ticks = 0;
  return () => new Date(start.getTime() + 1000 * ticks++);
}

/** Unwraps an `Ok`, failing the test with the error otherwise. */
export function expectOk<T>(result: Result<T, unknown>): T {
  if (!result.ok) {
    throw new Error(`Expected ok, got ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

/**
 * Waits briefly for a feed's next event. Call it before triggering the
 * event: a feed starts listening on its first `next()`.
 */
export function nextEvent<T>(
  feed: AsyncIterator<T>,
  timeoutMs = 50
): Promise<T | 'nothing'> {
  return Promise.race([
    feed.next().then(({ value }) => value),
    new Promise<'nothing'>((resolve) =>
      setTimeout(() => resolve('nothing'), timeoutMs)
    ),
  ]);
}

/**
 * The whole application over in-memory adapters. Override any port to
 * observe or break it.
 */
export function createTestApp(overrides: Partial<Dependencies> = {}) {
  const { repositories, fixtures } = createInMemoryRepositories();
  const clock = overrides.clock ?? tickingClock();
  const deps: Dependencies = {
    repositories,
    passwords: fakePasswordHasher,
    tokens: createJwtTokenService({ secret: TEST_JWT_SECRET, ttlSeconds: 60 }),
    events: createPubSubMessageEvents(),
    chatEvents: createPubSubChatEvents(),
    profileEvents: createPubSubProfileEvents(),
    typingEvents: createPubSubTypingEvents(),
    clock,
    inviteCodes: sequentialInviteCodes(),
    throttle: createMemoryThrottle({ limit: 10, windowMs: 60_000, clock }),
    linkPreviewer: fakeLinkPreviewer(),
    giphy: fakeGiphy(),
    pictures: zlibPictureCodec,
    pushSender: recordingPushSender().sender,
    pushKey: TEST_PUSH_KEY,
    watching: createMemoryWatching(),
    admins: [],
    storageGauge: fakeStorageGauge(),
    storageLimit: null,
    ...overrides,
  };
  return {
    deps,
    fixtures,
    /** Fresh services and loaders, as one request would get them. */
    services: () => createScope(deps, { cache: true }).services,
  };
}
