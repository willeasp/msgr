import { ApolloServer } from '@apollo/server';
import { ApolloServerPluginDrainHttpServer } from '@apollo/server/plugin/drainHttpServer';
import { expressMiddleware } from '@as-integrations/express5';
import { makeExecutableSchema } from '@graphql-tools/schema';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express, { type Response } from 'express';
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
import { resolvers } from './resolvers.js';
import { typeDefs } from './schema.js';

export const schema = makeExecutableSchema({ typeDefs, resolvers });

const PATH = '/graphql';
const COOKIE = 'token';

/**
 * Scripts, styles, fonts and connections only from this address; images may
 * also be data URIs (the identicons). Nothing may frame the app.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "img-src 'self' data:",
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
    express.json(),
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
