import ActionButton from '../../sacred/components/ActionButton';
import DropdownMenuTrigger from '../../sacred/components/DropdownMenuTrigger';
import Navigation from '../../sacred/components/Navigation';
import RowSpaceBetween from '../../sacred/components/RowSpaceBetween';
import { useModals } from '../../sacred/components/page/ModalContext';
import { useClock } from '../hooks/use-clock';
import { AboutDialog } from './AboutDialog';
import { MARK } from './icons';
import { PixelIcon } from './PixelIcon';
import styles from './MenuBar.module.css';

export interface MenuItem {
  label: string;
  /** Shown right-aligned, the way menus list keyboard shortcuts. */
  shortcut?: string;
  checked?: boolean;
  onClick: () => void;
}

/**
 * A pull-down menu: a title in the menu bar, or another button such as the
 * composer's Attach, that opens Sacred's DropdownMenu.
 */
export function Menu({
  title,
  items,
  button,
}: {
  title: string;
  items: MenuItem[];
  /** The menu's title as an ActionButton, unless another is given. */
  button?: React.ReactElement<React.HTMLAttributes<HTMLElement>>;
}) {
  return (
    <DropdownMenuTrigger
      items={items.map(({ label, shortcut, checked, onClick }) => ({
        icon: checked ? '✓' : '',
        children: (
          <RowSpaceBetween style={{ width: '100%', gap: '3ch' }}>
            <span>{label}</span>
            {shortcut && <span>{shortcut}</span>}
          </RowSpaceBetween>
        ),
        onClick,
      }))}
    >
      {button ?? <ActionButton>{title}</ActionButton>}
    </DropdownMenuTrigger>
  );
}

interface MenuBarProps {
  /** The pull-down menus after the logo. */
  menus: React.ReactNode;
  /** Shown at the right, before the clock. */
  status?: React.ReactNode;
}

export function MenuBar({ menus, status }: MenuBarProps) {
  const { open } = useModals();
  const now = useClock();

  return (
    <header className={styles.root}>
      <Navigation
        logo={<PixelIcon bitmap={MARK} scale={1} label="About Msgr" />}
        onClickLogo={() => open(AboutDialog, {})}
        left={menus}
        right={
          <span className={styles.status}>
            {status && <span className={styles.who}>{status}</span>}
            <time dateTime={now.toISOString()}>
              {now.toLocaleTimeString([], {
                hour: 'numeric',
                minute: '2-digit',
              })}
            </time>
          </span>
        }
      />
    </header>
  );
}
