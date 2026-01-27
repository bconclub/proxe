'use client'

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

interface FadeInSectionProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
}

export default function FadeInSection({ children, delay = 0, className = '' }: FadeInSectionProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!ref.current || typeof window === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && ref.current) {
          setIsVisible(true);
          observer.unobserve(ref.current);
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
    );

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, []);

  return (
    <motion.section
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 30 }}
      animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.6, delay: delay / 1000, ease: [0.25, 0.1, 0.25, 1] }}
    >
      {children}
    </motion.section>
  );
}

