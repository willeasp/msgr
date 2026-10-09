import Button from '../../sacred/components/Button';
import { useModals } from '../../sacred/components/page/ModalContext';
import { useHotkeys } from '../../sacred/modules/hotkeys';
import { COMPUTER } from './icons';
import { DialogButtons, DialogMessage, MacDialog } from './MacDialog';
import { Muted } from './Muted';
import styles from './AboutDialog.module.css';

/** Opened from the logo in the menu bar. */
export function AboutDialog() {
  const { close } = useModals();
  useHotkeys('Escape', () => close(), { enableOnFormTags: true });

  return (
    <MacDialog title="About Msgr" modal>
      <DialogMessage icon={COMPUTER}>
        <h1 className={styles.name}>Msgr</h1>
        Real-time chat, from one desk to another.
        <br />
        <br />
        <Muted>
          Built from Sacred Computer components. Set in Chicago and Departure
          Mono.
        </Muted>
      </DialogMessage>
      <DialogButtons>
        <Button autoFocus onClick={() => close()}>
          OK
        </Button>
      </DialogButtons>
    </MacDialog>
  );
}
