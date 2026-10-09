import BlockLoader from '../../sacred/components/BlockLoader';
import styles from './LoadingState.module.css';

interface LoadingStateProps {
  label: string;
  /** Fill the screen with the desktop, rather than sit in the flow. */
  fill?: boolean;
}

/** A quartered-clock spinner, after the old wristwatch cursor. */
export function LoadingState({ label, fill = false }: LoadingStateProps) {
  const status = (
    <div className={styles.inline} role="status">
      <BlockLoader mode={9} /> {label}…
    </div>
  );

  return fill ? (
    <div className={styles.fill}>
      <div className={styles.box}>{status}</div>
    </div>
  ) : (
    status
  );
}
