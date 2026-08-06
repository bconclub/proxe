'use client'

import React from 'react';
import styles from './InfinityLoader.module.css';

/**
 * "PROXe is thinking" indicator.
 *
 * Was a Lottie animation fetched from /assets/icons/Typing in chat.json, with a
 * static "..." as the fallback while it loaded. That file does not exist in
 * this brand pack, or anywhere in the repo, so the fetch 404'd every time, the
 * .catch() swallowed it, and the fallback WAS the indicator: three full stops
 * that never moved. The agent looked frozen on every single reply.
 *
 * Three CSS-animated dots instead. Nothing to fetch, so nothing to 404, and
 * lottie-react comes off the widget's critical path.
 */
export function InfinityLoader() {
  return (
    <div className={styles.loadingContainer} role="status" aria-label="PROXe is typing">
      <span className={styles.dot} />
      <span className={styles.dot} />
      <span className={styles.dot} />
    </div>
  );
}

export default InfinityLoader;
