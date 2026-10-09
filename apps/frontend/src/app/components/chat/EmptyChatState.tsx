import Button from '../../../sacred/components/Button';
import { MacWindow } from '../MacWindow';
import styles from './EmptyChatState.module.css';

interface EmptyChatStateProps {
  onNewChat: () => void;
  onNewChannel: () => void;
  onInvite: () => void;
}

/** The desktop while no chat is open: everything there is to start. */
export function EmptyChatState({
  onNewChat,
  onNewChannel,
  onInvite,
}: EmptyChatStateProps) {
  return (
    <div className={styles.root}>
      <div className={styles.window}>
        <MacWindow title="Msgr">
          <div className={styles.body}>
            Open a chat from the Chats window, or start something new.
            <div className={styles.actions}>
              <Button theme="SECONDARY" onClick={onInvite}>
                Invite a Friend…
              </Button>
              <Button theme="SECONDARY" onClick={onNewChannel}>
                New Channel…
              </Button>
              <Button onClick={onNewChat}>New Chat…</Button>
            </div>
          </div>
        </MacWindow>
      </div>
    </div>
  );
}
