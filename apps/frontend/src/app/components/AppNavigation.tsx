import { useMutation, useQuery } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import { gql } from '../../lib/__generated__';
import { ME } from '../auth/protected-route';
import { Menu, MenuBar } from './MenuBar';
import { ThemeMenu } from './ThemeMenu';

const LOGOUT_MUTATION = gql(`
  mutation Logout {
    logout
  }
`);

interface AppNavigationProps {
  onNewChat: () => void;
  /** Present while a chat is open. */
  onCloseChat?: () => void;
}

/** The signed-in menu bar. */
export function AppNavigation({ onNewChat, onCloseChat }: AppNavigationProps) {
  const navigate = useNavigate();
  const { data } = useQuery(ME);
  const [logout] = useMutation(LOGOUT_MUTATION, {
    onCompleted: () => {
      localStorage.removeItem('authToken');
      navigate('/login');
    },
  });

  return (
    <MenuBar
      menus={
        <>
          <Menu
            title="File"
            items={[
              { label: 'New Chat…', shortcut: '⌃K', onClick: onNewChat },
              ...(onCloseChat
                ? [{ label: 'Close Chat', onClick: onCloseChat }]
                : []),
              { label: 'Log Out', onClick: () => logout() },
            ]}
          />
          <ThemeMenu />
        </>
      }
      status={data?.me?.name}
    />
  );
}
