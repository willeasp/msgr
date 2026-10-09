import Window from '../../sacred/components/Window';
import styles from './MacWindow.module.css';

interface MacWindowProps {
  title: string;
  /** Puts a close box in the title bar. */
  onClose?: () => void;
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
        <h2 className={styles.title}>{title}</h2>
      </header>
      {info && <div className={styles.info}>{info}</div>}
      <div className={styles.body}>{children}</div>
    </Window>
  );
}
