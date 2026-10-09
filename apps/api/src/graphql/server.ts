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

  const subscriptions = useServer(
    {
      schema,
      // One context per subscription, alive across many events: batch, don't cache.
      context: ({ connectionParams }) =>
        createContext(deps, {
          token: stringOrUndefined(connectionParams?.['token']),
          cookie: noCookie,
          cache: false,
        }),
    },
    new WebSocketServer({ server: httpServer, path: PATH })
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

  await new Promise<void>((resolve) => httpServer.listen(config.port, resolve));
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

const stringOrUndefined = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;
