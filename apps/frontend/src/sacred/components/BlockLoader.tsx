import styles from './BlockLoader.module.css';

import * as React from 'react';

const SEQUENCES = [
  ['⠁', '⠂', '⠄', '⡀', '⢀', '⠠', '⠐', '⠈'],
  ['⣾', '⣽', '⣻', '⢿', '⡿', '⣟', '⣯', '⣷'],
  ['▖', '▘', '▝', '▗'],
  ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█', '▇', '▆', '▅', '▄', '▃', '▁'],
  ['▉', '▊', '▋', '▌', '▍', '▎', '▏', '▎', '▍', '▌', '▋', '▊', '▉'],
  ['←', '↖', '↑', '↗', '→', '↘', '↓', '↙'],
  ['┤', '┘', '┴', '└', '├', '┌', '┬', '┐'],
  ['◢', '◣', '◤', '◥'],
  ['◰', '◳', '◲', '◱'],
  ['◴', '◷', '◶', '◵'],
  ['◐', '◓', '◑', '◒'],
];

interface BlockLoaderProps extends Omit<React.HTMLAttributes<HTMLSpanElement>, 'children'> {
  mode?: number;
}

const BlockLoader: React.FC<BlockLoaderProps> = ({ mode = 0 }) => {
  const sequence = SEQUENCES[mode];
  const [index, setIndex] = React.useState(0);
  const intervalRef = React.useRef<number | null>(null);
  const indexLength = sequence?.length ?? 0;

  React.useEffect(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }

    if (!indexLength) return;

    intervalRef.current = window.setInterval(() => {
      setIndex((prevIndex) => (prevIndex + 1) % indexLength);
    }, 100);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [indexLength]);

  if (!sequence) {
    return <span className={styles.block}>�</span>;
  }

  return <span className={styles.root}>{sequence[index % indexLength]}</span>;
};

export default BlockLoader;
