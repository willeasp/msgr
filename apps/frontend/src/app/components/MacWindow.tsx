import Window from '../../sacred/components/Window';
import styles from './MacWindow.module.css';
import { PixelText } from './PixelText';

interface MacWindowProps {
  title: string;
  /** Puts a close box in the title bar. */
  onClose?: () => void;
  /** At the right of the title bar, across the stripes from the close box. */
  status?: React.ReactNode;
  /** A Finder-style line under the title bar, for counts and names. */
  info?: React.ReactNode;
  /** Stretch to the height of the space it sits in. */
  fill?: boolean;
  children: React.ReactNode;
}

/** A document window: Sacred's Window under a pinstriped title bar. */
export function MacWindow({
  title,
  onClose,
  status,
  info,
  fill = false,
  children,
}: MacWindowProps) {
  return (
    <Window
      role="region"
      aria-label={title}
      style={fill ? { height: '100%' } : undefined}
    >
      <header className={styles.titleBar}>
        {onClose && (
          <button
            type="button"
            className={styles.closeBox}
            onClick={onClose}
            aria-label={`Close ${title}`}
          />
        )}
        <h2 className={styles.title}>
          <PixelText text={title} />
        </h2>
        {status && <div className={styles.status}>{status}</div>}
      </header>
      {info && <div className={styles.info}>{info}</div>}
      <div className={styles.body}>{children}</div>
    </Window>
  );
}
