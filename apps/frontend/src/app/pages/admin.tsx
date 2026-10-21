import { useQuery } from '@apollo/client/react';
import { useNavigate } from 'react-router-dom';
import { gql } from '../../lib/__generated__';
import { CONTENT_NAMES, formatBytes, share } from '../../lib/storage';
import Button from '../../sacred/components/Button';
import { COMPUTER } from '../components/icons';
import { LoadingState } from '../components/LoadingState';
import { DialogButtons, MacDialog } from '../components/MacDialog';
import { MenuBar } from '../components/MenuBar';
import { Muted } from '../components/Muted';
import { PixelIcon } from '../components/PixelIcon';
import { ThemeMenu } from '../components/ThemeMenu';
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
  const navigate = useNavigate();
  const { data, loading, error } = useQuery(STORAGE, {
    fetchPolicy: 'network-only',
  });

  if (loading) return <LoadingState label="Measuring" fill />;
  const storage = data?.admin?.storage;
  if (error || !storage) return <NotFound />;

  // Each row's bar is its share of what's used: the plan's whole would leave them empty.
  const whole = storage.usedBytes;
  return (
    <div className={page.screen}>
      <MenuBar menus={<ThemeMenu />} />
      <main className={page.desktop}>
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
            <Button autoFocus onClick={() => navigate('/')}>
              Back to Chats
            </Button>
          </DialogButtons>
        </MacDialog>
      </main>
    </div>
  );
}

export default AdminPage;
