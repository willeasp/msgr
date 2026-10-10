import CardDouble from '../../sacred/components/CardDouble';
import { PixelIcon } from './PixelIcon';
import type { Bitmap } from '../../lib/pixels';
import styles from './MacDialog.module.css';

interface MacDialogProps {
  title: string;
  /** Opened through Sacred's modal stack, rather than placed on a page. */
  modal?: boolean;
  /** As wide as its contents need, rather than a column of text. */
  wide?: boolean;
  children: React.ReactNode;
}

/** A dialog box: Sacred's double-bordered card on a raised sheet of paper. */
export function MacDialog({
  title,
  modal = false,
  wide = false,
  children,
}: MacDialogProps) {
  return (
    <div
      className={wide ? `${styles.dialog} ${styles.wide}` : styles.dialog}
      role={modal ? 'dialog' : 'region'}
      aria-modal={modal || undefined}
      aria-label={title}
    >
      <CardDouble title={title}>{children}</CardDouble>
    </div>
  );
}

/** The classic alert layout: an icon on the left, the words beside it. */
export function DialogMessage({
  icon,
  children,
}: {
  icon: Bitmap;
  children: React.ReactNode;
}) {
  return (
    <div className={styles.message}>
      <PixelIcon bitmap={icon} scale={2} />
      <div className={styles.text}>{children}</div>
    </div>
  );
}

/** Buttons sit bottom right, the default one last. */
export function DialogButtons({ children }: { children: React.ReactNode }) {
  return <div className={styles.buttons}>{children}</div>;
}
