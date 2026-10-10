import Button from '../../sacred/components/Button';
import { useModals } from '../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../sacred/modules/hotkeys';
import { DialogButtons, DialogMessage, MacDialog } from './MacDialog';
import { COMPUTER } from './icons';

/** Turning notifications on didn't work: where to allow them, or why it can't. */
export function NotificationsBlockedDialog({
  reason,
}: {
  reason: 'blocked' | 'failed';
}) {
  const { close } = useModals();
  useHotkeys('Escape', () => close(), { enableOnFormTags: true });

  return (
    <MacDialog title="Notifications" modal>
      <DialogMessage icon={COMPUTER}>
        {reason === 'blocked'
          ? 'Your browser is blocking notifications from Msgr. Allow them in its settings for this site (on a computer, the icon left of the address bar; on Android, ⋮ → Settings → Site settings; on an iPhone, Settings → Notifications → Msgr), then turn them on again from the Special menu.'
          : 'This browser couldn’t turn on notifications for Msgr. Brave, for one, needs “Use Google services for push messaging” turned on in its privacy settings.'}
      </DialogMessage>
      <DialogButtons>
        <Button autoFocus onClick={() => close()}>
          OK
        </Button>
      </DialogButtons>
    </MacDialog>
  );
}
