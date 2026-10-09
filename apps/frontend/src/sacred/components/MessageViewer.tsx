import styles from './MessageViewer.module.css';

import * as React from 'react';

export default function MessageViewer(props: { children?: React.ReactNode }) {
  return (
    <div className={styles.message}>
      <div className={styles.left}>
        <div className={styles.bubble}>{props.children}</div>
      </div>
      <div className={styles.right}>
        <figure className={styles.triangle} />
      </div>
    </div>
  );
}
