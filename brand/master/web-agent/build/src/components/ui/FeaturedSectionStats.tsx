"use client";

import {
  AreaChart,
  Area,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from "recharts";
import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import FadeInElement from "@/components/shared/FadeInElement";
import styles from "./FeaturedSectionStats.module.css";

const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const value = payload[0].value;
    const name = payload[0].payload.name;
    return (
      <div style={{
        backgroundColor: 'rgba(19, 22, 44, 0.9)',
        border: '1px solid rgba(79, 13, 202, 0.32)',
        borderRadius: '12px',
        backdropFilter: 'blur(28px)',
        padding: '12px 16px',
        color: 'rgba(255, 255, 255, 0.95)',
      }}>
        <p style={{ margin: '0 0 4px 0', fontSize: '12px', opacity: 0.8 }}>{name}</p>
        <p style={{ margin: 0 }}>{`Improved conversations, ${value}%`}</p>
      </div>
    );
  }
  return null;
};

export default function FeaturedSectionStats() {
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

  const data = [
    { name: "Month 1", value: 27 },
    { name: "Month 2", value: 35 },
    { name: "Month 3", value: 48 },
    { name: "Month 4", value: 62 },
    { name: "Month 5", value: 78 },
    { name: "Month 6", value: 95 },
    { name: "Month 7", value: 115 },
  ];

  return (
    <motion.section
      ref={ref}
      className={styles.featuredSection}
      initial={{ opacity: 0, y: 30 }}
      animate={isVisible ? { opacity: 1, y: 0 } : { opacity: 0, y: 30 }}
      transition={{ duration: 0.6, delay: 0.3, ease: [0.25, 0.1, 0.25, 1] }}
    >
      <div className={styles.contentWrapper}>
        <FadeInElement>
          <h3 className={styles.heading}>
            The PROXe Effect{" "}
            <FadeInElement delay={50}>
              <span className={styles.subheading}>
                One AI brain across all channels, turning conversations into revenue.
              </span>
            </FadeInElement>
          </h3>
        </FadeInElement>
        
        {/* Stats grid */}
        <div className={styles.statsGrid}>
          <FadeInElement delay={100}>
            <div className={styles.statCard}>
              <p className={styles.statValue}>1,000,000+</p>
              <p className={styles.statLabel}>Conversations at Scale</p>
            </div>
          </FadeInElement>
          <FadeInElement delay={150}>
            <div className={styles.statCard}>
              <p className={styles.statValue}>&lt; 2s</p>
              <p className={styles.statLabel}>Lightning Fast Replies</p>
            </div>
          </FadeInElement>
          <FadeInElement delay={200}>
            <div className={styles.statCard}>
              <p className={styles.statValue}>142%</p>
              <p className={styles.statLabel}>Qualified Lead Surge</p>
            </div>
          </FadeInElement>
          <FadeInElement delay={250}>
            <div className={styles.statCard}>
              <p className={styles.statValue}>99.9%</p>
              <p className={styles.statLabel}>Always-On Reliability</p>
            </div>
          </FadeInElement>
        </div>
      </div>

      {/* Area Chart */}
      <FadeInElement delay={300}>
        <div className={styles.chartContainer} tabIndex={-1}>
          <h4 className={styles.chartHeading}>Improved Conversations</h4>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart 
            data={data}
            margin={{ left: 10, right: 10, top: 10, bottom: 30 }}
          >
            <defs>
              <linearGradient id="colorProxe" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#7244FF" stopOpacity={0.4} />
                <stop offset="95%" stopColor="#7244FF" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis 
              dataKey="name"
              hide={true}
            />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="value"
              stroke="#7244FF"
              strokeWidth={2}
              fillOpacity={1}
              fill="url(#colorProxe)"
            />
          </AreaChart>
        </ResponsiveContainer>
        </div>
      </FadeInElement>
    </motion.section>
  );
}

