import { useApolloClient, useMutation, useQuery } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import { gql } from '../../lib/__generated__';
import { ME } from '../auth/protected-route';
import { useModals } from '../../sacred/components/page/ModalContext';
import { InviteDialog } from './InviteDialog';
import { Menu, MenuBar } from './MenuBar';
import { ThemeMenu } from './ThemeMenu';

const LOGOUT_MUTATION = gql(`
  mutation Logout {
    logout
  }
`);

interface AppNavigationProps {
  alerts: {
    notify: boolean;
    sound: boolean;
    /** Absent where the browser has no desktop notifications. */
    onToggleNotify?: () => void;
    onToggleSound: () => void;
  };
  onNewChat: () => void;
  onJoinChannel: () => void;
  /** Present while a chat is open. */
  onCloseChat?: () => void;
  /** Present while a channel is open. */
  onLeaveChannel?: () => void;
}

/** The signed-in menu bar. */
export function AppNavigation({
  alerts,
  onNewChat,
  onJoinChannel,
  onCloseChat,
  onLeaveChannel,
}: AppNavigationProps) {
  const navigate = useNavigate();
  const client = useApolloClient();
  const { open } = useModals();
  const { data } = useQuery(ME);
  const [logout] = useMutation(LOGOUT_MUTATION, {
    // Forget everything cached for this user before anyone else signs in.
    onCompleted: async () => {
      await client.clearStore();
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
              { label: 'Join Channel…', onClick: onJoinChannel },
              {
                label: 'Invite a Friend…',
                onClick: () => open(InviteDialog, {}),
              },
              ...(onCloseChat
                ? [{ label: 'Close Chat', onClick: onCloseChat }]
                : []),
              ...(onLeaveChannel
                ? [{ label: 'Leave Channel', onClick: onLeaveChannel }]
                : []),
              { label: 'Log Out', onClick: () => logout() },
            ]}
          />
          <ThemeMenu />
          <Menu
            title="Special"
            items={[
              ...(alerts.onToggleNotify
                ? [
                    {
                      label: 'Notifications',
                      checked: alerts.notify,
                      onClick: alerts.onToggleNotify,
                    },
                  ]
                : []),
              {
                label: 'Alert Sound',
                checked: alerts.sound,
                onClick: alerts.onToggleSound,
              },
            ]}
          />
        </>
      }
      status={data?.me?.name}
    />
  );
}
