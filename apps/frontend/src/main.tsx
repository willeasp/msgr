import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';
import App from './app/app';
import {
  ApolloClient,
  InMemoryCache,
  HttpLink,
  ApolloLink,
} from '@apollo/client';
import { ApolloProvider } from '@apollo/client/react';
import { getMainDefinition } from '@apollo/client/utilities';
import { GraphQLWsLink } from '@apollo/client/link/subscriptions';
import { createClient } from 'graphql-ws';
import { ModalProvider } from './sacred/components/page/ModalContext';
import { applyTheme, loadTheme } from './lib/theme';
import { registerServiceWorker } from './app/hooks/use-service-worker';

applyTheme(loadTheme());
registerServiceWorker();

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

// The API lives at the app's own address (Vite proxies it in development),
// so the httpOnly session cookie authenticates both requests and sockets.
const httpLink = new HttpLink({ uri: '/graphql' });

const wsLink = new GraphQLWsLink(
  createClient({
    url: `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${
      window.location.host
    }/graphql`,
    lazy: true, // Only connect while a subscription is active
    // A phone drops the socket whenever it sleeps: keep coming back, at most
    // 10 s apart.
    retryAttempts: Infinity,
    retryWait: (retries) =>
      new Promise((done) =>
        setTimeout(done, Math.min(1000 * 2 ** retries, 10_000))
      ),
    on: {
      // Events are lost while the socket is down: on its return, ask again.
      connected: (_socket, _payload, wasRetry) => {
        if (wasRetry) void client.refetchQueries({ include: 'active' });
      },
    },
  })
);

// Split link: use WebSocket for subscriptions, HTTP for queries/mutations
const link = ApolloLink.split(
  ({ query }) => {
    const definition = getMainDefinition(query);
    return (
      definition.kind === 'OperationDefinition' &&
      definition.operation === 'subscription'
    );
  },
  wsLink, // Use WebSocket for subscriptions
  httpLink // Use HTTP for queries and mutations
);

const client = new ApolloClient({
  link,
  cache: new InMemoryCache(),
});

root.render(
  <StrictMode>
    <ApolloProvider client={client}>
      <BrowserRouter>
        <ModalProvider>
          <App />
        </ModalProvider>
      </BrowserRouter>
    </ApolloProvider>
  </StrictMode>
);
