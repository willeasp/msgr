import Button from '../../sacred/components/Button';
import { useModals } from '../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../sacred/modules/hotkeys';
import { useInstallPrompt } from '../hooks/use-install-prompt';
import { dismissOffer } from '../hooks/use-notifications';
import { DialogButtons, DialogMessage, MacDialog } from './MacDialog';
import { COMPUTER } from './icons';

/** Offers notifications, once per device; on an iPhone in Safari, how to install Msgr first. */
export function NotificationsDialog({
  setup,
  onTurnOn,
}: {
  setup: 'push' | 'install-first';
  onTurnOn: () => void;
}) {
  const { close } = useModals();
  const install = useInstallPrompt();
  const dismiss = () => {
    dismissOffer();
    close();
  };
  useHotkeys('Escape', dismiss, { enableOnFormTags: true });

  if (setup === 'install-first') {
    return (
      <MacDialog title="Notifications" modal>
        <DialogMessage icon={COMPUTER}>
          To get notifications, add Msgr to your Home Screen: tap Share, then
          “Add to Home Screen”, and open Msgr from there.
        </DialogMessage>
        <DialogButtons>
          <Button autoFocus onClick={dismiss}>
            OK
          </Button>
        </DialogButtons>
      </MacDialog>
    );
  }

  return (
    <MacDialog title="Notifications" modal>
      <DialogMessage icon={COMPUTER}>
        Get a notification when a message arrives, even with Msgr closed?
      </DialogMessage>
      <DialogButtons>
        {install && (
          <Button theme="SECONDARY" onClick={install}>
            Install
          </Button>
        )}
        <Button theme="SECONDARY" onClick={dismiss}>
          Not Now
        </Button>
        <Button
          autoFocus
          onClick={() => {
            close();
            onTurnOn(); // Still inside the click, which the permission prompt needs.
          }}
        >
          Turn On
        </Button>
      </DialogButtons>
    </MacDialog>
  );
}
