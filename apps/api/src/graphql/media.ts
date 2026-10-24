import {
  Router,
  type ErrorRequestHandler,
  type Express,
  type Request,
  type Response,
} from 'express';
import type { Dependencies } from '../application/ports.js';
import { loadExisting, type Loaders } from '../application/loaders.js';
import type { NotFound } from '../domain/errors.js';
import type { MediaPart, Message, MessageId } from '../domain/message.js';
import type { MovieSize } from '../domain/movie.js';
import {
  pictureVersion,
  type Picture,
  type PictureSize,
} from '../domain/picture.js';
import type { Result } from '../domain/result.js';
import type { SoundLength } from '../domain/sound.js';
import type { User, UserId } from '../domain/user.js';
import { createContext, noCookie } from './context.js';

/*
 * A picture, movie or sound has an address of its own, on this server and
 * behind the session cookie, where its bytes are served as they are: never
 * inside the JSON, and kept by the browser once fetched. The app only
 * follows the address, so where the bytes live can change (a CDN, object
 * storage) without it.
 */

/** One part of a message: its picture, movie or sound. */
interface MessagePart<P extends MediaPart> {
  readonly kind: 'message';
  readonly message: MessageId;
  readonly part: P;
}

/** Someone's profile picture, which comes with them. */
interface AvatarOf {
  readonly kind: 'avatar';
  readonly user: UserId;
  readonly avatar: Picture;
}

/** Whose picture, movie or sound it is, which says where its bytes are. */
export type MediaSource = MessagePart<MediaPart> | AvatarOf;

/** As the schema serves them: their size, and where their bytes are. */
export type ServedPicture = PictureSize & {
  readonly source: MessagePart<'picture'> | AvatarOf;
};
export type ServedMovie = MovieSize & { readonly source: MessagePart<'movie'> };
export type ServedSound = SoundLength & {
  readonly source: MessagePart<'sound'>;
};

/** What a message holds, each with its size and where its bytes are. */
export const servedParts = ({ id, picture, movie, sound }: Message) => ({
  picture: picture && {
    width: picture.width,
    height: picture.height,
    source: { kind: 'message', message: id, part: 'picture' } as const,
  },
  movie: movie && {
    width: movie.width,
    height: movie.height,
    frames: movie.frames,
    source: { kind: 'message', message: id, part: 'movie' } as const,
  },
  sound: sound && {
    frames: sound.frames,
    source: { kind: 'message', message: id, part: 'sound' } as const,
  },
});

/** Someone's profile picture, its size its own. */
export const servedAvatar = ({ id, avatar }: User): ServedPicture | null =>
  avatar && {
    width: avatar.width,
    height: avatar.height,
    source: { kind: 'avatar', user: id, avatar },
  };

/** Where the bytes of what `source` names are. */
export const mediaUrl = (source: MediaSource): string =>
  source.kind === 'message'
    ? `/media/${encodeURIComponent(source.message)}/${source.part}`
    : `/avatars/${encodeURIComponent(source.user)}/${pictureVersion(
        source.avatar
      )}`;

/** The bytes themselves: an avatar's come with its user, a message's from the loader. */
export async function mediaBytes(
  source: MediaSource,
  loaders: Loaders
): Promise<Uint8Array> {
  if (source.kind === 'avatar') return source.avatar.deflated;
  const media = await loadExisting(loaders.media, source.message);
  if (media.part !== source.part) {
    throw new Error(`Message ${source.message} has no ${source.part}`);
  }
  return media.bytes;
}

/**
 * Serves `/media/:messageId/:part` and `/avatars/:userId/:version`. A message
 * never changes, and an avatar's address changes with it, so whoever may see
 * them keeps them a year, but only for the session that fetched them. Anything
 * else is a 404, whether missing, not theirs, or asked for without a session.
 */
export function serveMedia(
  app: Express,
  deps: Dependencies,
  sessionOf: (req: Request) => string | undefined
): void {
  const viewing = (req: Request) =>
    createContext(deps, {
      token: sessionOf(req),
      cookie: noCookie,
      cache: true,
    });
  // One address for each: `/MEDIA/…` and a trailing slash are other ones.
  const routes = Router({ strict: true, caseSensitive: true });

  routes.get('/media/:messageId/:part', async (req, res) => {
    const { messageId, part } = req.params;
    if (!isId(messageId) || !isMediaPart(part)) return missing(res);
    const { viewer, services } = await viewing(req);
    if (!viewer) return missing(res);
    send(res, await services.messages.media(viewer, messageId, part));
  });

  routes.get('/avatars/:userId/:version', async (req, res) => {
    const { userId, version } = req.params;
    if (!isId(userId) || !/^[0-9a-z]{1,16}$/.test(version)) {
      return missing(res);
    }
    const { viewer, services } = await viewing(req);
    if (!viewer) return missing(res);
    send(res, await services.users.avatar(viewer, userId, version));
  });

  app.use(routes);
  app.use(['/media', '/avatars'], (_req: Request, res: Response) =>
    missing(res)
  );
  // A defect's own words never reach a client: see graphql/errors.ts.
  app.use(['/media', '/avatars'], ((error, _req, res, _next) => {
    console.error(error);
    res.set('Cache-Control', 'no-store').status(500).end();
  }) satisfies ErrorRequestHandler);
}

/** What an id looks like here; anything else can't name a thing. */
const isId = (id: string) => /^[A-Za-z0-9_-]{1,64}$/.test(id);

const isMediaPart = (part: string): part is MediaPart =>
  part === 'picture' || part === 'movie' || part === 'sound';

function send(res: Response, bytes: Result<Uint8Array, NotFound>): void {
  if (!bytes.ok) return missing(res);
  res
    .set({
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'private, max-age=31536000, immutable',
      // Kept for this session's cookie alone: whoever signs in next on the
      // device asks again, and is answered for themselves.
      Vary: 'Cookie',
    })
    // The kept bytes themselves, not a copy.
    .send(
      Buffer.from(
        bytes.value.buffer,
        bytes.value.byteOffset,
        bytes.value.byteLength
      )
    );
}

function missing(res: Response): void {
  res.set('Cache-Control', 'no-store').status(404).end();
}
