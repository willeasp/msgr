import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@as-integrations/express5';
import { makeExecutableSchema } from '@graphql-tools/schema';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Response } from 'express';
import {
  getOperationAST,
  GraphQLError,
  parse,
  validate,
  type DocumentNode,
} from 'graphql';
import { useServer } from 'graphql-ws/use/ws';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { join, resolve } from 'node:path';
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
import { serveMedia } from './media.js';
import { oneThingPerMutation } from './one-thing-per-mutation.js';
import { resolvers } from './resolvers.js';
import { typeDefs } from './schema.js';

export const schema = makeExecutableSchema({ typeDefs, resolvers });

const PATH = '/graphql';
const COOKIE = 'token';

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

/** Serves queries and mutations over HTTP and subscriptions over WebSocket. */
export async function startServer(
  deps: Dependencies,
  config: Config
): Promise<Server> {
  const app = express();
  const httpServer = createServer(app);

  app.use((_, res, next) => {
    res.set({
      'Content-Security-Policy': CONTENT_SECURITY_POLICY,
      'Referrer-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
    });
    next();
  });

  const subscriptions = useServer(
    {
      schema,
      // Browsers always say which site opened a socket. Refuse every site but
      // ours, or any page could open one riding the visitor's session cookie.
      onConnect: ({ extra }) =>
        isAllowedOrigin(extra.request.headers.origin, config.corsOrigin),
      // Messages, and the movies they may carry, are sent over HTTP, where
      // bodies and the work they ask for are bounded; the socket only listens.
      onSubscribe: (_, _id, payload) => {
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

  // Pictures', movies' and sounds' bytes, at addresses of their own.
  app.use(['/media', '/avatars'], cookieParser());
  serveMedia(app, deps, (req) => stringOrUndefined(req.cookies?.[COOKIE]));

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
    clear: () => res.clearCookie(COOKIE, options),
  };
}

/**
 * The built frontend, at the API's own address so one cookie covers both. Any
 * other GET is a client-side route ("/:chatId", "/invite/:code") and loads the app.
 */
function serveApp(app: express.Express, dir: string) {
  app.use(
    '/assets',
    express.static(join(dir, 'assets'), { immutable: true, maxAge: '1y' })
  );
  app.use(express.static(dir));
  app.use((req, res, next) =>
    // With `root`, only the path below it is checked for dot-directories, so
    // the app may live under one (a `.claude/worktrees/…` checkout, say).
    req.method === 'GET' ? res.sendFile('index.html', { root: dir }) : next()
  );
}

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
