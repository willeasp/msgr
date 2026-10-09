import Button from '../../../sacred/components/Button';
import { MacWindow } from '../MacWindow';
import styles from './EmptyChatState.module.css';

interface EmptyChatStateProps {
  onNewChat: () => void;
}

/** The desktop while no chat is open. */
export function EmptyChatState({ onNewChat }: EmptyChatStateProps) {
  return (
    <div className={styles.root}>
      <div className={styles.window}>
        <MacWindow title="Msgr">
          <div className={styles.body}>
            Open a chat from the Chats window, or start a new one.
            <div className={styles.actions}>
              <Button onClick={onNewChat}>New Chat…</Button>
            </div>
          </div>
        </MacWindow>
      </div>
    </div>
  );
}
