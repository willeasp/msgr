import Button from '../../sacred/components/Button';
import { useModals } from '../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../sacred/modules/hotkeys';
import { DialogButtons, DialogMessage, MacDialog } from './MacDialog';
import { COMPUTER } from './icons';

/** When the browser said no to notifications: where to say yes instead. */
export function NotificationsBlockedDialog() {
  const { close } = useModals();
  useHotkeys('Escape', () => close(), { enableOnFormTags: true });

  return (
    <MacDialog title="Notifications" modal>
      <DialogMessage icon={COMPUTER}>
        Your browser is blocking notifications from Msgr. Allow them in the site
        settings (the icon left of the address bar), then turn them on again
        from the Special menu.
      </DialogMessage>
      <DialogButtons>
        <Button autoFocus onClick={() => close()}>
          OK
        </Button>
      </DialogButtons>
    </MacDialog>
  );
}
