import Window from '../../sacred/components/Window';
import { usePhone } from '../hooks/use-phone';
import { BACK } from './icons';
import styles from './MacWindow.module.css';
import { PixelIcon } from './PixelIcon';
import { PixelText } from './PixelText';

interface MacWindowProps {
  title: string;
  /** Puts a close box in the title bar; on a phone, a back button. */
  onClose?: () => void;
  /** At the right of the title bar, across the stripes from the close box; on a phone, in the info line. */
  status?: React.ReactNode;
  /** A Finder-style line under the title bar, for counts and names. */
  info?: React.ReactNode;
  /** On a phone, the window's one control, at the right of its title bar. */
  action?: React.ReactNode;
  /** Stretch to the height of the space it sits in. */
  fill?: boolean;
  children: React.ReactNode;
}

/**
 * A document window: Sacred's Window under a pinstriped title bar. On a phone
 * its title bar navigates (ADR 0013): back on the left, its one control on
 * the right.
 */
export function MacWindow({
  title,
  onClose,
  status,
  info,
  action,
  fill = false,
  children,
}: MacWindowProps) {
  const isPhone = usePhone();

  return (
    <Window
      role="region"
      aria-label={title}
      style={fill ? { height: '100%' } : undefined}
    >
      <header className={styles.titleBar}>
        {onClose &&
          (isPhone ? (
            <button
              type="button"
              className={styles.back}
              onClick={onClose}
              aria-label="Back"
            >
              <span className={styles.glyph}>
                <PixelIcon bitmap={BACK} scale={1} />
              </span>
            </button>
          ) : (
            <button
              type="button"
              className={styles.closeBox}
              onClick={onClose}
              aria-label={`Close ${title}`}
            />
          ))}
        <h2 className={styles.title}>
          <PixelText text={title} />
        </h2>
        {isPhone
          ? action && <div className={styles.action}>{action}</div>
          : status && <div className={styles.status}>{status}</div>}
      </header>
      {(info || (isPhone && status)) && (
        <div className={styles.info}>
          {info}
          {isPhone && status}
        </div>
      )}
      <div className={styles.body}>{children}</div>
    </Window>
  );
}

/**
 * A control in a phone's title bar (MacWindow's `action`): a word or an icon
 * on the stripes, its target a thumb's size, reaching down over the info line.
 */
export function TitleBarButton({
  ref,
  children,
  ...rest
}: React.ComponentPropsWithRef<'button'>) {
  return (
    <button type="button" ref={ref} className={styles.titleButton} {...rest}>
      <span className={styles.glyph}>{children}</span>
    </button>
  );
}
