import { useMutation } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import { gql } from '../../lib/__generated__';
import { useModals } from '../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../sacred/modules/hotkeys';
import { useSessionChange } from '../hooks/use-session-change';
import { useForgetBrowser } from '../hooks/use-notifications';
import { useRestartToUpdate } from '../hooks/use-service-worker';
import { useSignedIn } from '../hooks/use-signed-in';
import { JoinChannelDialog } from './chat/JoinChannelDialog';
import { NewChatModal } from './chat/NewChatModal';
import { InviteDialog } from './InviteDialog';
import { Menu, MenuBar } from './MenuBar';
import { ProfileDialog } from './ProfileDialog';
import { ThemeMenu } from './ThemeMenu';
import { PixelText } from './PixelText';

const LOGOUT_MUTATION = gql(`
  mutation Logout {
    logout
  }
`);

/** What the view on screen adds to the File menu; everything else is the same everywhere. */
interface AppNavigationProps {
  /** Present while a channel is open. */
  onAddPeople?: () => void;
  /** Present while a chat is open. */
  onCloseChat?: () => void;
  /** Present while a channel is open. */
  onLeaveChannel?: () => void;
}

/** The signed-in menu bar, for every view under `SignedIn`. */
export function AppNavigation({
  onAddPeople,
  onCloseChat,
  onLeaveChannel,
}: AppNavigationProps) {
  const { viewer, isAdmin, alertSound, notifications, install } = useSignedIn();
  const { open } = useModals();
  const navigate = useNavigate();
  const changeSession = useSessionChange();
  const [logout] = useMutation(LOGOUT_MUTATION, {
    onCompleted: () => changeSession('/login'),
  });
  const forgetBrowser = useForgetBrowser();
  const restartToUpdate = useRestartToUpdate();

  const newChat = () => open(NewChatModal, {});
  useHotkeys('ctrl+k', newChat, {
    enableOnFormTags: true,
    preventDefault: true,
  });

  return (
    <MenuBar
      menus={
        <>
          <Menu
            title="File"
            items={[
              { label: 'New Chat…', shortcut: '⌃K', onClick: newChat },
              {
                label: 'New Channel…',
                onClick: () =>
                  open(JoinChannelDialog, { mode: 'new' as const }),
              },
              {
                label: 'Join Channel…',
                onClick: () => open(JoinChannelDialog, {}),
              },
              {
                label: 'Invite a Friend…',
                onClick: () => open(InviteDialog, {}),
              },
              ...(onAddPeople
                ? [{ label: 'Add People to Channel…', onClick: onAddPeople }]
                : []),
              ...(onCloseChat
                ? [{ label: 'Close Chat', onClick: onCloseChat }]
                : []),
              ...(onLeaveChannel
                ? [{ label: 'Leave Channel', onClick: onLeaveChannel }]
                : []),
              { label: 'Profile…', onClick: () => open(ProfileDialog, {}) },
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
                checked: alertSound.on,
                onClick: alertSound.toggle,
              },
              ...(install
                ? [{ label: 'Install Msgr…', onClick: install }]
                : []),
              ...(isAdmin
                ? [{ label: 'Storage…', onClick: () => navigate('/admin') }]
                : []),
              ...(restartToUpdate
                ? [{ label: 'Restart to Update', onClick: restartToUpdate }]
                : []),
            ]}
          />
        </>
      }
      status={<PixelText text={viewer.name} />}
    />
  );
}
