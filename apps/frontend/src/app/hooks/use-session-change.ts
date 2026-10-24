import { useApolloClient, useMutation } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import { gql } from '../../lib/__generated__';
import { useForgetBrowser } from './use-notifications';

/**
 * Signing in, up or out changes who the viewer is. Everything cached belongs
 * to the previous viewer, down to "nobody is signed in", so forget it all
 * before going on; otherwise the app keeps acting for the old one.
 */
export function useSessionChange() {
  const client = useApolloClient();
  const navigate = useNavigate();

  return async (to: string) => {
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

  return () =>
    forgetBrowser()
      .catch(() => undefined)
      .then(() => logout())
      .catch(() => undefined)
      .then(() => changeSession('/login'));
}
