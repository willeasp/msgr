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

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

const httpLink = new HttpLink({
  uri: 'http://localhost:4000/graphql',
  credentials: 'include', // Include cookies in requests
});

// WebSocket link for subscriptions
const wsLink = new GraphQLWsLink(
  createClient({
    url: 'ws://localhost:4000/graphql',
    lazy: true, // Only connect when a subscription is active
    connectionParams: () => {
      // Get token from localStorage for WebSocket authentication
      const token = localStorage.getItem('authToken');
      console.log(
        'WebSocket connectionParams - token:',
        token ? 'present' : 'missing'
      );
      return { token };
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
        <App />
      </BrowserRouter>
    </ApolloProvider>
  </StrictMode>
);
