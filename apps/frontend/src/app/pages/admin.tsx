import { useQuery } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import { gql } from '../../lib/__generated__';
import type { StorageQuery } from '../../lib/__generated__/graphql';
import { CONTENT_NAMES, formatBytes, share } from '../../lib/storage-report';
import Button from '../../sacred/components/Button';
import { AppNavigation } from '../components/AppNavigation';
import { BOMB, COMPUTER } from '../components/icons';
import { LoadingState } from '../components/LoadingState';
import {
  DialogButtons,
  DialogMessage,
  MacDialog,
} from '../components/MacDialog';
import { Muted } from '../components/Muted';
import { PixelIcon } from '../components/PixelIcon';
import NotFound from './not-found';
import page from './page.module.css';
import styles from './admin.module.css';

const STORAGE = gql(`
  query Storage {
    admin {
      storage {
        usedBytes
        limitBytes
        freeBytes
        contents {
          kind
          count
          bytes
        }
        tables {
          name
          bytes
        }
      }
    }
  }
`);

/** A bar filled as far as `part` is of `whole`, as About This Macintosh draws memory. */
function Bar({ part, whole }: { part: number; whole: number }) {
  return (
    <span className={styles.bar} aria-hidden="true">
      <span style={{ width: `${share(part, whole) * 100}%` }} />
    </span>
  );
}

/** The admin page: how full the database is, and with what. Anyone else finds nothing here. */
export function AdminPage() {
  const { data, loading, error, refetch } = useQuery(STORAGE, {
    fetchPolicy: 'network-only',
    notifyOnNetworkStatusChange: true,
  });

  if (loading) return <LoadingState label="Measuring" fill />;
  // Only someone who isn't an admin gets no admin, and without an error.
  if (!error && !data?.admin) return <NotFound />;

  return (
    <div className={page.screen}>
      <AppNavigation />
      <main className={page.desktop}>
        {data?.admin ? (
          <StorageDialog storage={data.admin.storage} />
        ) : (
          <MacDialog title="Storage">
            <DialogMessage icon={BOMB}>
              <p className={page.title}>The database couldn't be measured.</p>
              <Muted>{error?.message}</Muted>
            </DialogMessage>
            <DialogButtons>
              <BackToChats />
              <Button autoFocus onClick={() => void refetch()}>
                Try Again
              </Button>
            </DialogButtons>
          </MacDialog>
        )}
      </main>
    </div>
  );
}

function BackToChats({ autoFocus }: { autoFocus?: boolean }) {
  const navigate = useNavigate();
  return (
    <Button autoFocus={autoFocus} onClick={() => navigate('/')}>
      Back to Chats
    </Button>
  );
}

type Storage = NonNullable<StorageQuery['admin']>['storage'];

function StorageDialog({ storage }: { storage: Storage }) {
  // Each row's bar is its share of what's used: the plan's whole would leave them empty.
  const whole = storage.usedBytes;
  return (
    <MacDialog title="Storage" wide>
      <div className={styles.head}>
        <PixelIcon bitmap={COMPUTER} scale={2} />
        <div className={styles.total}>
          <p className={styles.used}>
            {formatBytes(storage.usedBytes)} used
            {storage.limitBytes != null &&
              ` of ${formatBytes(storage.limitBytes)}`}
          </p>
          {storage.freeBytes != null && (
            <p>{formatBytes(storage.freeBytes)} left</p>
          )}
          {storage.limitBytes != null && (
            <Bar part={storage.usedBytes} whole={storage.limitBytes} />
          )}
        </div>
      </div>

      <h2 className={styles.heading}>Contents</h2>
      <table className={styles.sizes}>
        <tbody>
          {storage.contents.map(({ kind, count, bytes }) => (
            <tr key={kind}>
              <th scope="row">{CONTENT_NAMES[kind]}</th>
              <td>{count.toLocaleString('en')}</td>
              <td>{formatBytes(bytes)}</td>
              <td>
                <Bar part={bytes} whole={whole} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <h2 className={styles.heading}>Tables</h2>
      <table className={styles.sizes}>
        <tbody>
          {storage.tables.map(({ name, bytes }) => (
            <tr key={name}>
              <th scope="row">{name}</th>
              <td>{formatBytes(bytes)}</td>
              <td>
                <Bar part={bytes} whole={whole} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <p className={styles.note}>
        <Muted>
          As Postgres counts it. Your host may count a little differently.
        </Muted>
      </p>
      <DialogButtons>
        <BackToChats autoFocus />
      </DialogButtons>
    </MacDialog>
  );
}

export default AdminPage;
