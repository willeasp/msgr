import { useState } from 'react';
import { TINTS, type Theme } from '../../lib/theme';
import { applyTheme, loadTheme } from '../browser/theme';
import { Menu } from './MenuBar';

const capitalize = (word: string) =>
  word.charAt(0).toUpperCase() + word.slice(1);

/** The View menu: light or dark, and Sacred's tints, remembered across visits. */
export function ThemeMenu() {
  const [theme, setTheme] = useState(loadTheme);

  const choose = (next: Theme) => {
    applyTheme(next, { save: true });
    setTheme(next);
  };

  return (
    <Menu
      title="View"
      items={[
        {
          label: 'Light',
          checked: theme.mode === 'light',
          onClick: () => choose({ ...theme, mode: 'light' }),
        },
        {
          label: 'Dark',
          checked: theme.mode === 'dark',
          onClick: () => choose({ ...theme, mode: 'dark' }),
        },
        {
          label: 'No Tint',
          checked: theme.tint === null,
          onClick: () => choose({ ...theme, tint: null }),
        },
        ...TINTS.map((tint) => ({
          label: `${capitalize(tint)} Tint`,
          checked: theme.tint === tint,
          onClick: () => choose({ ...theme, tint }),
        })),
      ]}
    />
  );
}
