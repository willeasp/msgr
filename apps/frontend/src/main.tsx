import { StrictMode } from 'react';
import { BrowserRouter } from 'react-router-dom';
import * as ReactDOM from 'react-dom/client';
import App from './app/app';
import { ApolloProvider } from '@apollo/client/react';
import { ModalProvider } from './sacred/components/page/ModalContext';
import { createApolloClient, preloadSignedIn } from './app/data/client';
import { registerServiceWorker } from './app/browser/service-worker';
import { applyTheme, loadTheme } from './app/browser/theme';

applyTheme(loadTheme());
registerServiceWorker();

const client = createApolloClient();
// Signing in and signing up are the only views for someone signed out.
if (!/^\/(login|invite)(\/|$)/.test(window.location.pathname)) {
  preloadSignedIn(client);
}

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

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
