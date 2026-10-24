import { ApolloClient, ApolloLink, HttpLink } from '@apollo/client';
import { RetryLink } from '@apollo/client/link/retry';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { createCache } from '../../lib/cache';
import {
  isWorthRetrying,
  PONG_WAIT_MS,
  silenceWatch,
} from '../../lib/connection';
import { GET_CHATS } from './chats';
import { ME } from './me';
import { retryMedia } from './media';

/**
 * The app's one Apollo client. The API lives at the app's own address (Vite
 * proxies it in development), so the httpOnly session cookie authenticates
 * both requests and the socket.
 */
export function createApolloClient(): ApolloClient {
  // Queries over HTTP, asked again until they reach a server that answers:
  // one may be waking, or the phone between networks (lib/connection.ts).
  const http = ApolloLink.from([
    new RetryLink({
      delay: { initial: 500, max: 5_000, jitter: true },
      attempts: {
        max: Infinity,
        retryIf: (error, operation) =>
          isWorthRetrying(error, operation.operationType),
      },
    }),
    new HttpLink({ uri: '/graphql' }),
  ]);

  // The live feed over a socket, only while something subscribes.
  const feed = createClient({
    url: `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${
      window.location.host
    }/graphql`,
    lazy: true,
    // A phone drops the socket whenever it sleeps: keep coming back, at
    // most 10 s apart.
    retryAttempts: Infinity,
    retryWait: (retries) =>
      new Promise((done) =>
        setTimeout(done, Math.min(1000 * 2 ** retries, 10_000))
      ),
    // A socket can die without a word, and a phone's does whenever the
    // page is covered by the camera or the photo picker: it still says
    // it's open, and hears nothing more. Ping it, and start again if the
    // server doesn't answer (lib/connection.ts).
    keepAlive: 15_000,
    on: {
      // Events are lost while the socket is down: on its return, ask again,
      // media that failed meanwhile included.
      connected: (socket, _payload, wasRetry) => {
        open = socket as WebSocket;
        if (!wasRetry) return;
        void client.refetchQueries({ include: 'active' });
        retryMedia();
      },
      ping: (received) => {
        if (!received) silence.asked();
      },
      pong: (received) => {
        if (received) silence.answered();
      },
      closed: () => {
        open = null;
        silence.answered();
      },
    },
  });
  let open: WebSocket | null = null;
  const silence = silenceWatch(PONG_WAIT_MS, () => feed.terminate());
  // Back from being hidden is when a socket is likeliest dead: ask at once,
  // rather than at the next ping, so a message missed meanwhile shows now.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return;
    if (open?.readyState !== WebSocket.OPEN) return;
    open.send(JSON.stringify({ type: 'ping' }));
    silence.asked();
  });
  const socket = new GraphQLWsLink(feed);

  const client = new ApolloClient({
    link: ApolloLink.split(
      ({ operationType }) => operationType === 'subscription',
      socket,
      http
    ),
    cache: createCache(),
  });
  return client;
}

/**
 * Asks for what every signed-in view needs first, together rather than one
 * after the other: who's signed in, and their chats. On a server that's
 * waking, both then wait at once.
 */
export function preloadSignedIn(client: ApolloClient): void {
  for (const query of [ME, GET_CHATS]) {
    client.query({ query }).catch(() => undefined);
  }
}
