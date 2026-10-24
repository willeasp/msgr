import { useEffect, useState } from 'react';
import { QUIET_MS, WAIT_NOTICES, waitOf } from '../../lib/connection';
import Button from '../../sacred/components/Button';
import { useMovieTick } from '../hooks/use-movie';
import { useOnline } from '../hooks/use-online';
import { useLogOut } from '../hooks/use-session-change';
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
 * signed out for want of an answer. Only an error is the viewer's to act on:
 * try again, or, should it last, sign in afresh.
 */
export function Connecting({ failed, onRetry }: ConnectingProps) {
  const online = useOnline();
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const timer = setTimeout(() => setSlow(true), QUIET_MS);
    return () => clearTimeout(timer);
  }, []);

  const wait = waitOf({ online, slow, failed });
  const tick = useMovieTick(wait === 'waking');
  const logOut = useLogOut();

  return (
    <div className={styles.screen}>
      <MenuBar menus={<ThemeMenu />} />
      <main className={styles.desktop}>
        {wait !== 'quiet' && (
          <MacDialog title="Msgr">
            <div role="status">
              <DialogMessage
                icon={
                  wait === 'failed'
                    ? BOMB
                    : wait === 'offline'
                    ? COMPUTER
                    : watchAt(tick)
                }
              >
                <p className={styles.title}>{WAIT_NOTICES[wait].title}</p>
                <Muted>{WAIT_NOTICES[wait].detail}</Muted>
              </DialogMessage>
            </div>
            {wait === 'failed' && (
              <DialogButtons>
                <Button onClick={() => void logOut()}>Sign In Again…</Button>
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
