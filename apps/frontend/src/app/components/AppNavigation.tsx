import { useMutation, useQuery } from '@apollo/client/react';
import { gql } from '../../lib/__generated__';
import { ME } from '../auth/protected-route';
import { useSessionChange } from '../auth/use-session-change';
import { Menu, MenuBar } from './MenuBar';
import { ThemeMenu } from './ThemeMenu';
import { PixelText } from './PixelText';

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
  onNewChannel: () => void;
  onJoinChannel: () => void;
  onInvite: () => void;
  /** Present while a channel is open. */
  onAddPeople?: () => void;
  /** Present while a chat is open. */
  onCloseChat?: () => void;
  /** Present while a channel is open. */
  onLeaveChannel?: () => void;
}

/** The signed-in menu bar. */
export function AppNavigation({
  alerts,
  onNewChat,
  onNewChannel,
  onJoinChannel,
  onInvite,
  onAddPeople,
  onCloseChat,
  onLeaveChannel,
}: AppNavigationProps) {
  const changeSession = useSessionChange();
  const { data } = useQuery(ME);
  const [logout] = useMutation(LOGOUT_MUTATION, {
    onCompleted: () => changeSession('/login'),
  });

  return (
    <MenuBar
      menus={
        <>
          <Menu
            title="File"
            items={[
              { label: 'New Chat…', shortcut: '⌃K', onClick: onNewChat },
              { label: 'New Channel…', onClick: onNewChannel },
              { label: 'Join Channel…', onClick: onJoinChannel },
              { label: 'Invite a Friend…', onClick: onInvite },
              ...(onAddPeople
                ? [{ label: 'Add People to Channel…', onClick: onAddPeople }]
                : []),
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
      status={data?.me && <PixelText text={data.me.name} />}
    />
  );
}
