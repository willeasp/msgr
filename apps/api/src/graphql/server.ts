import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@as-integrations/express5';
import { makeExecutableSchema } from '@graphql-tools/schema';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Request, type Response } from 'express';
import {
  getOperationAST,
  GraphQLError,
  parse,
  validate,
  type DocumentNode,
} from 'graphql';
import { useServer } from 'graphql-ws/use/ws';
import { readdirSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { extname, join, relative, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import type { Dependencies } from '../application/ports.js';
import type { Config } from '../config.js';
import {
  createContext,
  noCookie,
  type Context,
  type SessionCookie,
} from './context.js';
import { boundedQueries } from './bounded-queries.js';
import { maskDefect, maskDefects } from './errors.js';
import { serveGiphy } from './gifs.js';
import { serveMedia } from './media.js';
import { oneThingPerMutation } from './one-thing-per-mutation.js';
import { resolvers } from './resolvers.js';
import { typeDefs } from './schema.js';

export const schema = makeExecutableSchema({ typeDefs, resolvers });

const PATH = '/graphql';
const COOKIE = 'token';
/** Subscriptions one socket may hold; the app holds 5. */
export const MAX_SUBSCRIPTIONS = 20;

/**
 * Scripts, styles, fonts and connections only from this address; images may
 * also be data URIs (the identicons), and video blob URLs (a file the viewer
 * picked, played on their own device to make a movie). Nothing may frame the
 * app.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' data:",
  "media-src 'self' blob:",
  "style-src 'self' 'unsafe-inline'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

export interface Server {
  readonly url: string;
  stop(): Promise<void>;
}

/**
 * Serves queries and mutations over HTTP and subscriptions over WebSocket.
 *
 * It listens at once: the app answers while `ready` (the database being
 * brought up to date) is still pending; GraphQL, over HTTP and WebSocket
 * alike, and `/healthz` wait for it.
 */
export async function startServer(
  deps: Dependencies,
  config: Config,
  ready: Promise<unknown> = Promise.resolve()
): Promise<Server> {
  const app = express();
  const httpServer = createServer(app);
  app.disable('x-powered-by');

  app.use((_, res, next) => {
    res.set({
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Permissions-Policy': 'geolocation=(), payment=(), usb=()',
      'Referrer-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
      ...(config.corsOrigin.startsWith('https://') && {
        'Strict-Transport-Security': 'max-age=31536000',
      }),
    });
    next();
  });

  // For the host's health check and uptime monitors. Healthy once the
  // database is up to date, so a deploy whose migration fails or hangs never
  // takes over from the instance before it; from then on it's answered from
  // memory, never waking the database, which sleeps when nobody's using Msgr.
  app.get('/healthz', async (_, res) => {
    await ready;
    res.set('Cache-Control', 'no-store').status(204).end();
  });

  const subscriptions = useServer(
    {
      schema,
      // Browsers always say which site opened a socket. Refuse every site but
      // ours, or any page could open one riding the visitor's session cookie.
      onConnect: async ({ extra }) => {
        await ready;
        return isAllowedOrigin(extra.request.headers.origin, config.corsOrigin);
      },
      // Messages, and the movies they may carry, are sent over HTTP, where
      // bodies and the work they ask for are bounded; the socket only listens.
      onSubscribe: (ctx, _id, payload) => {
        // Every subscription runs again for every event: a socket holds a few.
        if (Object.keys(ctx.subscriptions).length > MAX_SUBSCRIPTIONS) {
          return [
            new GraphQLError(
              `A connection may hold at most ${MAX_SUBSCRIPTIONS} subscriptions.`
            ),
          ];
        }
        let document: DocumentNode;
        try {
          document = parse(payload.query);
        } catch {
          return undefined; // graphql-ws reports the syntax error itself
        }
        const operation = getOperationAST(document, payload.operationName);
        if (operation?.operation !== 'subscription') {
          return [new GraphQLError('Only subscriptions go over the socket.')];
        }
        const unbounded = validate(schema, document, [boundedQueries]);
        return unbounded.length > 0 ? unbounded : undefined;
      },
      onNext: (_ctx, _id, _payload, _args, result) =>
        result.errors
          ? { ...result, errors: result.errors.map(maskDefect) }
          : undefined,
      // One context per subscription, alive across many events: batch, don't cache.
      context: ({ connectionParams, extra }) =>
        createContext(deps, {
          token:
            stringOrUndefined(connectionParams?.['token']) ??
            cookieValue(extra.request.headers.cookie, COOKIE),
          cookie: noCookie,
          cache: false,
        }),
    },
    // Sockets carry subscriptions, a few hundred bytes; messages go over HTTP.
    new WebSocketServer({
      server: httpServer,
      path: PATH,
      maxPayload: 64 * 1024,
    })
  );

  const apollo = new ApolloServer<Context>({
    schema,
    validationRules: [oneThingPerMutation, boundedQueries],
    formatError: maskDefects,
    // main.ts stops the server itself, after any migration under way.
    stopOnTerminationSignals: false,
    plugins: [
      ApolloServerPluginDrainHttpServer({ httpServer }),
      {
        async serverWillStart() {
          return {
            async drainServer() {
              await subscriptions.dispose();
            },
          };
        },
      },
    ],
  });
  await apollo.start();

  app.use(
    PATH,
    async (_req, _res, next) => {
      await ready;
      next();
    },
    cors({ origin: config.corsOrigin, credentials: true }),
    // A message's largest honest movie, 48 frames of 320×320, is under 0.95
    // MB as base64 (domain/movie.ts); a minute's sound is at most 0.4 MB,
    // and a picture far less.
    express.json({ limit: '1mb' }),
    cookieParser(),
    expressMiddleware(apollo, {
      context: ({ req, res }) =>
        createContext(deps, {
          token: stringOrUndefined(req.cookies?.[COOKIE]),
          cookie: httpCookie(res, config),
          cache: true,
        }),
    })
  );

  // Pictures', movies' and sounds' bytes, at addresses of their own, and
  // GIPHY's, fetched for whoever is signed in.
  app.use(
    ['/media', '/avatars', '/giphy'],
    async (_req, _res, next) => {
      await ready;
      next();
    },
    cookieParser()
  );
  const sessionOf = (req: Request) => stringOrUndefined(req.cookies?.[COOKIE]);
  serveMedia(app, deps, sessionOf);
  serveGiphy(app, deps, sessionOf);

  if (config.staticDir) serveApp(app, resolve(config.staticDir));

  await new Promise<void>((done) => httpServer.listen(config.port, done));
  const { port } = httpServer.address() as AddressInfo;
  return {
    url: `http://localhost:${port}${PATH}`,
    stop: () => apollo.stop(),
  };
}

function httpCookie(res: Response, config: Config): SessionCookie {
  const options = {
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    path: '/',
  } as const;
  return {
    set: (token) =>
      res.cookie(COOKIE, token, {
        ...options,
        maxAge: config.sessionTtlSeconds * 1000,
      }),
    // And whatever the browser kept for the session (media, by address), so
    // nothing of it stays on the device for whoever uses it next.
    clear: () =>
      res.clearCookie(COOKIE, options).set('Clear-Site-Data', '"cache"'),
  };
}

/**
 * The built frontend, at the API's own address so one cookie covers both. Any
 * other GET is a client-side route ("/:chatId", "/invite/:code") and loads the
 * app. Hashed assets never change, so browsers keep them a year; a missing
 * one is a 404, not the app. The build compresses ahead of time, so this tiny
 * server never spends CPU on it: a file with a `.br` or `.gz` beside it is
 * sent as that to any browser that takes it.
 */
function serveApp(app: express.Express, dir: string) {
  const compressed = new Set(
    filesIn(dir).filter((file) => /\.(br|gz)$/.test(file))
  );
  const send = (req: Request, res: Response, file: string) => {
    res.set('Cache-Control', cacheControl(file)).set('Vary', 'Accept-Encoding');
    // Asked one at a time: browsers list gzip first, but brotli is smaller.
    const variant = ENCODINGS.find(
      ([name, suffix]) =>
        req.acceptsEncodings(name) === name && compressed.has(file + suffix)
    );
    if (variant) res.type(extname(file)).set('Content-Encoding', variant[0]);
    // With `root`, only the path below it is checked for dot-directories, so
    // the app may live under one (a `.claude/worktrees/…` checkout, say).
    res.sendFile(file + (variant?.[1] ?? ''), {
      root: dir,
      cacheControl: false,
    });
  };

  app.use((req, res, next) => {
    const file = req.path.slice(1);
    const isGet = req.method === 'GET' || req.method === 'HEAD';
    if (isGet && (compressed.has(`${file}.br`) || compressed.has(`${file}.gz`)))
      return send(req, res, file);
    next();
  });
  app.use(
    '/assets',
    express.static(join(dir, 'assets'), {
      immutable: true,
      maxAge: '1y',
      fallthrough: false,
    })
  );
  // The app at its own address too, compressed: not express.static's index.
  app.use(express.static(dir, { index: false }));
  app.use((req, res, next) =>
    req.method === 'GET' || req.method === 'HEAD'
      ? send(req, res, 'index.html')
      : next()
  );
}

/** What the build compresses each text file to, best first. */
const ENCODINGS = [
  ['br', '.br'],
  ['gzip', '.gz'],
] as const;

const cacheControl = (file: string) =>
  file.startsWith('assets/')
    ? 'public, max-age=31536000, immutable'
    : 'public, max-age=0';

/** Every file under `dir`, as a path relative to it with forward slashes. */
const filesIn = (dir: string): string[] =>
  readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) =>
      relative(dir, join(entry.parentPath, entry.name)).replaceAll('\\', '/')
    );

/** Only a browser sends `Origin`; anything else is not at risk of being tricked. */
const isAllowedOrigin = (origin: string | undefined, allowed: string) =>
  origin === undefined || origin === allowed;

function cookieValue(
  header: string | undefined,
  name: string
): string | undefined {
  for (const pair of header?.split(';') ?? []) {
    const [key, ...value] = pair.trim().split('=');
    if (key === name) return decodeURIComponent(value.join('='));
  }
  return undefined;
}

const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;
