'use client'

import { motion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';

interface FadeInElementProps {
  children: React.ReactNode;
  delay?: number;
  className?: string;
  animationType?: 'fadeUp' | 'fadeDown' | 'fadeLeft' | 'fadeRight' | 'scale' | 'blur';
}

const animationVariants = {
  fadeUp: {
    initial: { opacity: 0, y: 30 },
    animate: { opacity: 1, y: 0 },
  },
  fadeDown: {
    initial: { opacity: 0, y: -30 },
    animate: { opacity: 1, y: 0 },
  },
  fadeLeft: {
    initial: { opacity: 0, x: 30 },
    animate: { opacity: 1, x: 0 },
  },
  fadeRight: {
    initial: { opacity: 0, x: -30 },
    animate: { opacity: 1, x: 0 },
  },
  scale: {
    initial: { opacity: 0, scale: 0.9 },
    animate: { opacity: 1, scale: 1 },
  },
  blur: {
    initial: { opacity: 0, filter: 'blur(10px)' },
    animate: { opacity: 1, filter: 'blur(0px)' },
  },
};

export default function FadeInElement({ 
  children, 
  delay = 0, 
  className = '',
  animationType 
}: FadeInElementProps) {
  const [isVisible, setIsVisible] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  
  // Randomly select animation type if not provided
  const [selectedAnimation] = useState(() => {
    if (animationType) return animationType;
    const types: Array<keyof typeof animationVariants> = ['fadeUp', 'fadeDown', 'fadeLeft', 'fadeRight', 'scale'];
    return types[Math.floor(Math.random() * types.length)];
  });

  useEffect(() => {
    if (!ref.current || typeof window === 'undefined') return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && ref.current) {
          setIsVisible(true);
          observer.unobserve(ref.current);
        }
      },
      { threshold: 0.1, rootMargin: '0px 0px -20px 0px' }
    );

    observer.observe(ref.current);

    return () => observer.disconnect();
  }, []);

  const variant = animationVariants[selectedAnimation];
  const randomDelay = delay + (Math.random() * 200);

  return (
    <motion.div
      ref={ref}
      className={className}
      initial={variant.initial}
      animate={isVisible ? variant.animate : variant.initial}
      transition={{ 
        duration: 0.5 + Math.random() * 0.3, 
        delay: randomDelay / 1000, 
        ease: [0.25, 0.1, 0.25, 1] 
      }}
    >
      {children}
    </motion.div>
  );
}

