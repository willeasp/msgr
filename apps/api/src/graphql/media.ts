import type { Express, Request, Response } from 'express';
import type { Dependencies } from '../application/ports.js';
import { loadExisting, type Loaders } from '../application/loaders.js';
import type { NotFound } from '../domain/errors.js';
import type { MediaPart, MessageId } from '../domain/message.js';
import type { MovieSize } from '../domain/movie.js';
import {
  pictureVersion,
  type Picture,
  type PictureSize,
} from '../domain/picture.js';
import type { Result } from '../domain/result.js';
import type { SoundLength } from '../domain/sound.js';
import type { UserId } from '../domain/user.js';
import { createContext, noCookie } from './context.js';

/*
 * A picture, movie or sound has an address of its own, on this server and
 * behind the session cookie, where its bytes are served as they are: never
 * inside the JSON, and kept by the browser once fetched. The app only
 * follows the address, so where the bytes live can change (a CDN, object
 * storage) without it.
 */

/** Whose picture, movie or sound it is, which says where its bytes are. */
export type MediaSource =
  | { readonly message: MessageId }
  | { readonly avatarOf: UserId; readonly avatar: Picture };

/** As the schema serves them: their size, and where their bytes are. */
export type ServedPicture = PictureSize & { readonly source: MediaSource };
export type ServedMovie = MovieSize & {
  readonly source: { readonly message: MessageId };
};
export type ServedSound = SoundLength & {
  readonly source: { readonly message: MessageId };
};

/** Where the bytes of `part` of what `source` names are. */
export const mediaUrl = (source: MediaSource, part: MediaPart): string =>
  'message' in source
    ? `/media/${encodeURIComponent(source.message)}/${part}`
    : `/avatars/${encodeURIComponent(source.avatarOf)}/${pictureVersion(
        source.avatar
      )}`;

/** The bytes themselves: an avatar's come with its user, a message's from the loader. */
export const mediaBytes = async (
  source: MediaSource,
  loaders: Loaders
): Promise<Uint8Array> =>
  'message' in source
    ? loadExisting(loaders.media, source.message)
    : source.avatar.deflated;

/**
 * Serves `/media/:messageId/:part` and `/avatars/:userId/:version`. A message
 * never changes, and an avatar's address changes with it, so whoever may see
 * them keeps them a year. Anything else is a 404, whether missing, not
 * theirs, or asked for without a session.
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

  app.get('/media/:messageId/:part', async (req, res) => {
    const { messageId, part } = req.params;
    const { viewer, services } = await viewing(req);
    if (!viewer || !isMediaPart(part)) return missing(res);
    send(res, await services.messages.media(viewer, messageId, part));
  });

  app.get('/avatars/:userId/:version', async (req, res) => {
    const { userId, version } = req.params;
    const { viewer, services } = await viewing(req);
    if (!viewer) return missing(res);
    send(res, await services.users.avatar(viewer, userId, version));
  });
}

const isMediaPart = (part: string): part is MediaPart =>
  part === 'picture' || part === 'movie' || part === 'sound';

function send(res: Response, bytes: Result<Uint8Array, NotFound>): void {
  if (!bytes.ok) return missing(res);
  res
    .set({
      'Content-Type': 'application/octet-stream',
      'Cache-Control': 'private, max-age=31536000, immutable',
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
