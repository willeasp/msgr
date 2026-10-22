import { useEffect, useState } from 'react';
import { connectingNotice, QUIET_MS } from '../../lib/connection';
import Button from '../../sacred/components/Button';
import { useMovieTick } from '../hooks/use-movie';
import { useOnline } from '../hooks/use-online';
import { BOMB, COMPUTER, watchAt } from './icons';
import { DialogButtons, DialogMessage, MacDialog } from './MacDialog';
import { MenuBar } from './MenuBar';
import { Muted } from './Muted';
import { ThemeMenu } from './ThemeMenu';
import styles from './Connecting.module.css';

interface ConnectingProps {
  /** The server answered, but with an error rather than who's signed in. */
  failed: boolean;
  onRetry: () => void;
}

/**
 * What a signed-in view shows until the server says who's signed in: the
 * desktop at once, from the shell on this device, and only if that takes a
 * while, why. Asking again happens by itself (lib/connection.ts); nobody is
 * signed out for want of an answer.
 */
export function Connecting({ failed, onRetry }: ConnectingProps) {
  const online = useOnline();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), QUIET_MS);
    return () => clearTimeout(timer);
  }, []);

  const notice = connectingNotice({ online, slow, failed });
  const waiting = notice !== null && !failed && online;
  const tick = useMovieTick(waiting);

  return (
    <div className={styles.screen}>
      <MenuBar menus={<ThemeMenu />} />
      <main className={styles.desktop}>
        {notice && (
          <MacDialog title="Msgr">
            <div role="status">
              <DialogMessage
                icon={failed ? BOMB : online ? watchAt(tick) : COMPUTER}
              >
                <p className={styles.title}>{notice.title}</p>
                <Muted>{notice.detail}</Muted>
              </DialogMessage>
            </div>
            {notice.retry && (
              <DialogButtons>
                <Button autoFocus onClick={onRetry}>
                  Try Again
                </Button>
              </DialogButtons>
            )}
          </MacDialog>
        )}
      </main>
    </div>
  );
}
