import { useMutation, useQuery } from '@apollo/client/react';
import { gql } from '../../lib/__generated__';
import { ME } from '../auth/protected-route';
import { useSessionChange } from '../auth/use-session-change';
import { useForgetBrowser } from '../hooks/use-notifications';
import { Menu, MenuBar } from './MenuBar';
import { ThemeMenu } from './ThemeMenu';
import { PixelText } from './PixelText';

const LOGOUT_MUTATION = gql(`
  mutation Logout {
    logout
  }
`);

interface AppNavigationProps {
  alerts: { sound: boolean; onToggleSound: () => void };
  /** Special → Notifications, where this browser can have them. */
  notifications?: { label: string; checked?: boolean; onClick: () => void };
  onNewChat: () => void;
  onNewChannel: () => void;
  onJoinChannel: () => void;
  onInvite: () => void;
  onProfile: () => void;
  /** Present while a channel is open. */
  onAddPeople?: () => void;
  /** Present while a chat is open. */
  onCloseChat?: () => void;
  /** Present while a message is selected. */
  onGetInfo?: () => void;
  /** Present while a channel is open. */
  onLeaveChannel?: () => void;
  /** Present while the browser offers to install Msgr. */
  onInstall?: () => void;
}

/** The signed-in menu bar. */
export function AppNavigation({
  alerts,
  notifications,
  onNewChat,
  onNewChannel,
  onJoinChannel,
  onInvite,
  onProfile,
  onAddPeople,
  onCloseChat,
  onGetInfo,
  onLeaveChannel,
  onInstall,
}: AppNavigationProps) {
  const changeSession = useSessionChange();
  const { data } = useQuery(ME);
  const [logout] = useMutation(LOGOUT_MUTATION, {
    onCompleted: () => changeSession('/login'),
  });
  const forgetBrowser = useForgetBrowser();

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
              ...(onGetInfo
                ? [{ label: 'Get Info', shortcut: '⌃I', onClick: onGetInfo }]
                : []),
              ...(onLeaveChannel
                ? [{ label: 'Leave Channel', onClick: onLeaveChannel }]
                : []),
              { label: 'Profile…', onClick: onProfile },
              {
                label: 'Log Out',
                // While still signed in, so the server lets go of this browser
                // too; a failure there never keeps anyone signed in.
                onClick: () =>
                  void forgetBrowser()
                    .catch(() => undefined)
                    .then(() => logout()),
              },
            ]}
          />
          <ThemeMenu />
          <Menu
            title="Special"
            items={[
              ...(notifications ? [notifications] : []),
              {
                label: 'Alert Sound',
                checked: alerts.sound,
                onClick: alerts.onToggleSound,
              },
              ...(onInstall
                ? [{ label: 'Install Msgr…', onClick: onInstall }]
                : []),
            ]}
          />
        </>
      }
      status={data?.me && <PixelText text={data.me.name} />}
    />
  );
}
