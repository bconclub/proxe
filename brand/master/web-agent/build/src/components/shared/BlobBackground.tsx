'use client'

import React from 'react';
import styles from './BlobBackground.module.css';

interface BlobBackgroundProps {
  brand?: string;
}

export function BlobBackground({ brand = 'proxe' }: BlobBackgroundProps) {
  return (
    <div className={styles.blobContainer} data-brand={brand}>
      <div className={`${styles.blob} ${styles.blob1}`}></div>
      <div className={`${styles.blob} ${styles.blob2}`}></div>
      <div className={`${styles.blob} ${styles.blob3}`}></div>
      <div className={`${styles.blob} ${styles.blob4}`}></div>
      <div className={`${styles.blob} ${styles.blob5}`}></div>
      <div className={`${styles.blob} ${styles.blob6}`}></div>
    </div>
  );
}

