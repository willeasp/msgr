import { useNavigate } from 'react-router-dom';
import { useModals } from '../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../sacred/modules/hotkeys';
import { useLogOut } from '../hooks/use-session-change';
import { useRestartToUpdate } from '../hooks/use-service-worker';
import { useSignedIn } from '../hooks/use-signed-in';
import {
  InviteDialog,
  JoinChannelDialog,
  NewChatModal,
  ProfileDialog,
} from './dialogs';
import { Menu, MenuBar } from './MenuBar';
import { ThemeMenu } from './ThemeMenu';
import { PixelText } from './PixelText';

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
  const logOut = useLogOut();
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
              { label: 'Log Out', onClick: () => void logOut() },
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
