import { useApolloClient, useMutation } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import { gql } from '../../lib/__generated__';
import { showBadge } from '../browser/badge';
import { liveConnection } from '../data/client';
import { forgetMedia } from '../data/media';
import { forgetOutbox } from '../data/outbox';
import { useForgetBrowser } from './use-notifications';

/**
 * Signing in, up or out changes who the viewer is. Everything cached belongs
 * to the previous viewer, down to "nobody is signed in", and their pictures,
 * movies and sounds too, and their app's badge, so forget it all before
 * going on; otherwise the app keeps acting for the old one.
 */
export function useSessionChange() {
  const client = useApolloClient();
  const navigate = useNavigate();

  return async (to: string) => {
    forgetMedia();
    // What the last person hadn't sent goes with them, unsent.
    forgetOutbox();
    liveConnection.forget();
    showBadge(0);
    await client.clearStore();
    navigate(to);
  };
}

const LOGOUT = gql(`
  mutation Logout {
    logout
  }
`);

/**
 * Logs out, then shows the login page. The server lets go of this browser's
 * notifications first, while the viewer is still signed in. Neither failing
 * keeps anyone here: signing in again replaces the session anyway.
 */
export function useLogOut() {
  const [logout] = useMutation(LOGOUT);
  const forgetBrowser = useForgetBrowser();
  const changeSession = useSessionChange();

  return () => {
    // Nothing waiting goes once they ask; anything they send meanwhile
    // goes as them, and is let go with the rest when they're out.
    forgetOutbox();
    return forgetBrowser()
      .catch(() => undefined)
      .then(() => logout())
      .catch(() => undefined)
      .then(() => changeSession('/login'));
  };
}
