'use client'

import React, { useEffect, useState } from 'react';
import Lottie from 'lottie-react';
import styles from './InfinityLoader.module.css';

export function InfinityLoader() {
  const [animationData, setAnimationData] = useState<any>(null);

  useEffect(() => {
    // Load the Lottie JSON file
    fetch('/assets/icons/Typing in chat.json')
      .then((response) => response.json())
      .then((data) => {
        setAnimationData(data);
      })
      .catch(() => {
        // Silently fail and use fallback
      });
  }, []);

  if (!animationData) {
    // Fallback while loading - animated 3 dots
    return (
      <div className={styles.loadingContainer}>
        <div className={styles.typingIndicatorFallback}>
          <span />
          <span />
          <span />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.loadingContainer}>
      <Lottie
        animationData={animationData}
        className={styles.typingAnimation}
        loop={true}
        autoplay={true}
      />
    </div>
  );
}
