import {
  Router,
  type ErrorRequestHandler,
  type Express,
  type Request,
  type Response,
} from 'express';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Dependencies } from '../application/ports.js';
import type { GiphyMedia } from '../domain/gif.js';
import { createContext, noCookie } from './context.js';

/*
 * GIPHY's stills and movies, fetched by this server for whoever is signed in,
 * so their browser talks to this server alone and GIPHY never sees who looks.
 * The app makes a movie of one on the device, as it does from a video file.
 */

const PATH = '/giphy/media';

/** Where this server serves one of GIPHY's files from. */
export const giphyAddress = (url: GiphyMedia): string =>
  `${PATH}?url=${encodeURIComponent(url)}`;

/**
 * Serves `/giphy/media?url=…`: the file at one of GIPHY's own addresses,
 * as it arrives. Anything else, or anything asked without a session, is a
 * 404, as is a file GIPHY hasn't got.
 */
export function serveGiphy(
  app: Express,
  deps: Dependencies,
  sessionOf: (req: Request) => string | undefined
): void {
  const routes = Router({ strict: true, caseSensitive: true });
  routes.get(PATH, async (req, res) => {
    const { url } = req.query;
    // A HEAD would fetch a whole file to send none of it.
    if (req.method !== 'GET' || typeof url !== 'string') return missing(res);
    const { viewer, services } = await createContext(deps, {
      token: sessionOf(req),
      cookie: noCookie,
      cache: true,
    });
    if (!viewer) return missing(res);
    const file = await services.gifs.file(viewer, url);
    if (!file) return missing(res);
    res.set({
      'Content-Type': file.type,
      // GIPHY's files don't change; kept a day, for this session alone.
      'Cache-Control': 'private, max-age=86400',
      Vary: 'Cookie',
      ...(file.length !== null && { 'Content-Length': String(file.length) }),
    });
    // A file cut short (GIPHY stopped, or sent more than it said) ends the
    // response early, which the app takes for a failure; one the browser
    // stops asking for stops being fetched.
    await pipeline(Readable.fromWeb(file.body), res).catch(() => res.destroy());
  });
  app.use(routes);
  app.use('/giphy', (_req: Request, res: Response) => missing(res));
  // A defect's own words never reach a client: see graphql/errors.ts.
  app.use('/giphy', ((error, _req, res, _next) => {
    console.error(error);
    res.set('Cache-Control', 'no-store').status(500).end();
  }) satisfies ErrorRequestHandler);
}

function missing(res: Response): void {
  res.set('Cache-Control', 'no-store').status(404).end();
}
