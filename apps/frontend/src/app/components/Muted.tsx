import styles from './Muted.module.css';

/** Secondary text, dimmed the way Sacred's examples dim chat previews. */
export function Muted({ children }: { children: React.ReactNode }) {
  return <span className={styles.muted}>{children}</span>;
}
