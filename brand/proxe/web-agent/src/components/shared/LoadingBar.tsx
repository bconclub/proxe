'use client'

import { useEffect, useState } from 'react';
import styles from './LoadingBar.module.css';

export default function LoadingBar() {
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState(0);
  const [fadeOut, setFadeOut] = useState(false);

  useEffect(() => {
    // Start immediately with a small progress to avoid grey screen
    setProgress(1);
    
    const startTime = Date.now();
    const duration = 1000; // 1 second

    // Smooth loading progress over 1 second
    const updateProgress = () => {
      const elapsed = Date.now() - startTime;
      const newProgress = Math.min(1 + (elapsed / duration) * 99, 100);
      setProgress(newProgress);

      if (newProgress < 100) {
        requestAnimationFrame(updateProgress);
      } else {
        // Start fade out
        setFadeOut(true);
        // Wait for fade out animation, then hide
        setTimeout(() => {
          setLoading(false);
        }, 800);
      }
    };

    // Complete loading when page is ready or after 1 second
    if (typeof window !== 'undefined') {
      const handleLoad = () => {
        const elapsed = Date.now() - startTime;
        if (elapsed < duration) {
          // If page loads before 1 second, complete at 1 second
          setTimeout(() => {
            setProgress(100);
            setFadeOut(true);
            setTimeout(() => {
              setLoading(false);
            }, 800);
          }, duration - elapsed);
        }
      };

      if (document.readyState === 'complete') {
        handleLoad();
      } else {
        window.addEventListener('load', handleLoad);
      }
    }

    // Start the progress animation immediately
    requestAnimationFrame(updateProgress);
  }, []);

  if (!loading) return null;

  return (
    <div className={`${styles.loadingOverlay} ${fadeOut ? styles.fadeOut : ''}`}>
      <div className={styles.loadingContent}>
        <div className={styles.loadingBarWrapper}>
          <div 
            className={styles.loadingBar} 
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

