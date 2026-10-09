import { useApolloClient } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';

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
