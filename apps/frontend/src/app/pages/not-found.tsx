import { useNavigate } from 'react-router-dom';
import Button from '../../sacred/components/Button';
import { BOMB } from '../components/icons';
import {
  DialogButtons,
  DialogMessage,
  MacDialog,
} from '../components/MacDialog';
import { MenuBar } from '../components/MenuBar';
import { Muted } from '../components/Muted';
import { ThemeMenu } from '../components/ThemeMenu';
import styles from './page.module.css';

export function NotFound() {
  const navigate = useNavigate();

  return (
    <div className={styles.screen}>
      <MenuBar menus={<ThemeMenu />} />
      <main className={styles.desktop}>
        <MacDialog title="System Error">
          <DialogMessage icon={BOMB}>
            <p className={styles.title}>Nothing lives at this address.</p>
            <Muted>Error 404</Muted>
          </DialogMessage>
          <DialogButtons>
            <Button autoFocus onClick={() => navigate('/')}>
              Back to Chats
            </Button>
          </DialogButtons>
        </MacDialog>
      </main>
    </div>
  );
}

export default NotFound;
