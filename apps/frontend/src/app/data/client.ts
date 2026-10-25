import { ApolloClient, ApolloLink, HttpLink } from '@apollo/client';
import { RetryLink } from '@apollo/client/link/retry';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { createCache, mayHaveMissed } from '../../lib/cache';
import {
  AWAY_MS,
  connectionAfter,
  isWorthRetrying,
  PONG_WAIT_MS,
  silenceWatch,
  type LiveConnection,
  type SocketEvent,
} from '../../lib/connection';
import { GET_CHATS } from './chats';
import { ME } from './me';
import { retryMedia } from './media';

let connection: LiveConnection = { kind: 'idle' };
const connectionListeners = new Set<() => void>();

function socketWas(event: SocketEvent) {
  const next = connectionAfter(connection, event, Date.now());
  if (next === connection) return;
  connection = next;
  for (const listener of connectionListeners) listener();
}

/**
 * Since when the live connection has been down, having been up; null while
 * it's up, before it first is (the Connecting screen's wait), or once it
 * was let go on purpose (lib/connection.ts). What a chat says
 * "Reconnecting…" from (useReconnecting).
 */
export const liveConnection = {
  downSince: () => (connection.kind === 'down' ? connection.since : null),
  subscribe(listener: () => void) {
    connectionListeners.add(listener);
    return () => {
      connectionListeners.delete(listener);
    };
  },
};

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
      // Events are lost while the socket is down: on its return, catch up.
      connected: (socket, _payload, wasRetry) => {
        open = socket as WebSocket;
        socketWas({ kind: 'connected' });
        if (wasRetry) catchUp();
      },
      ping: (received) => {
        if (!received) silence.asked();
      },
      pong: (received) => {
        if (received) silence.answered();
      },
      closed: (event) => {
        open = null;
        silence.answered();
        // A CloseEvent, or graphql-ws's own when the page terminates it.
        const code =
          typeof event === 'object' && event && 'code' in event
            ? event.code
            : null;
        socketWas({
          kind: 'closed',
          code: typeof code === 'number' ? code : null,
        });
      },
    },
  });
  let open: WebSocket | null = null;
  const silence = silenceWatch(PONG_WAIT_MS, () => feed.terminate());
  // Back from being hidden is when a socket is likeliest dead: ask at once,
  // rather than at the next ping, so a message missed meanwhile shows now.
  // Back from a while away (locked, or opened from a notification), catch up
  // at once too, rather than wait to learn whether the socket heard it all.
  let hiddenAt: number | null = null;
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt !== null && Date.now() - hiddenAt >= AWAY_MS) catchUp();
    hiddenAt = null;
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

  // Events may have been missed: ask again for what's on screen, and for the
  // chat list even when it isn't (a phone showing a chat), since it's read
  // from the cache when it comes back. Media that failed meanwhile too. Each
  // history held is whole only up to now, until its next newest page joins
  // it: what arrives before that may follow a gap.
  function catchUp() {
    mayHaveMissed(client.cache);
    const active = [...client.getObservableQueries('active')];
    void client.refetchQueries({ include: 'active' });
    // By name: what Apollo watches is its own copy of the document.
    if (!active.some((query) => query.queryName === 'GetChats')) {
      client
        .query({ query: GET_CHATS, fetchPolicy: 'network-only' })
        .catch(() => undefined);
    }
    retryMedia();
  }
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
