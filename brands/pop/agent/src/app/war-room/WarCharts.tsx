'use client';

// Premium War Room charts on Apache ECharts (v6) — gradient fills, rounded caps,
// soft glow/shadow, smooth animation. Theme-aware: text/track colors follow the
// app's light/dark tokens; the data hues stay vivid on the frosted-glass panels.
import { useEffect, useState } from 'react';
import ReactECharts from 'echarts-for-react';

function isDarkHex(hex: string): boolean {
  const m = hex.replace('#', '').match(/\w\w/g);
  if (!m || m.length < 3) return false;
  const [r, g, b] = m.map((h) => parseInt(h, 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 < 0.5;
}

// Resolve the concrete text/track colors ECharts' canvas needs (CSS vars can't be
// passed straight into canvas), and re-read them when the theme flips.
function useThemeColors() {
  const [c, setC] = useState({ text: '#0f172a', mut: '#64748b', track: 'rgba(15,23,42,0.08)', panel: '#ffffff', dark: false });
  useEffect(() => {
    const read = () => {
      const cs = getComputedStyle(document.documentElement);
      const bg = cs.getPropertyValue('--bg-primary').trim();
      const dark = bg ? isDarkHex(bg) : false;
      setC({
        text: cs.getPropertyValue('--text-primary').trim() || (dark ? '#e8eefc' : '#0f172a'),
        mut: cs.getPropertyValue('--text-secondary').trim() || (dark ? '#94a3b8' : '#64748b'),
        track: dark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.07)',
        panel: cs.getPropertyValue('--bg-secondary').trim() || (dark ? '#0b1626' : '#ffffff'),
        dark,
      });
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    return () => obs.disconnect();
  }, []);
  return c;
}

const vGrad = (top: string, bottom: string) => ({ type: 'linear' as const, x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: top }, { offset: 1, color: bottom }] });
const hGrad = (l: string, r: string) => ({ type: 'linear' as const, x: 0, y: 0, x2: 1, y2: 0, colorStops: [{ offset: 0, color: l }, { offset: 1, color: r }] });

const base = { renderer: 'canvas' as const };

// ── Support / Lean / Opposed — thick gradient ring with center total ──────────
export function LeanDonut({ data, total }: { data: Record<string, number>; total: number }) {
  const c = useThemeColors();
  const seg = [
    { name: 'Supporter', value: data.supporter || 0, top: '#4ADE80', bot: '#16A34A' },
    { name: 'Leaning', value: data.leaning || 0, top: '#A3E635', bot: '#65A30D' },
    { name: 'Undecided', value: data.undecided || 0, top: '#FBBF24', bot: '#D97706' },
    { name: 'Opposed', value: data.opposed || 0, top: '#FB923C', bot: '#EA580C' },
  ];
  const option = {
    animationDuration: 900, animationEasing: 'cubicOut',
    tooltip: { trigger: 'item', backgroundColor: c.panel, borderWidth: 0, textStyle: { color: c.text, fontSize: 11 }, extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(2,6,23,0.18);' },
    title: { text: String(total), subtext: 'voices', left: 'center', top: '38%',
      textStyle: { color: c.text, fontSize: 26, fontWeight: 800 }, subtextStyle: { color: c.mut, fontSize: 11 }, itemGap: 2 },
    series: [{
      type: 'pie', radius: ['62%', '90%'], center: ['50%', '50%'], avoidLabelOverlap: false,
      label: { show: false }, labelLine: { show: false },
      itemStyle: { borderRadius: 10, borderColor: 'transparent', borderWidth: 3, shadowBlur: 22, shadowColor: 'rgba(2,6,23,0.18)' },
      data: seg.map((s) => ({ name: s.name, value: s.value, itemStyle: { color: vGrad(s.top, s.bot) } })),
    }],
  };
  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} opts={base} notMerge lazyUpdate />;
}

// ── Sentiment — rounded gradient gauge arc ────────────────────────────────────
export function SentimentGauge({ value }: { value: number }) {
  const c = useThemeColors();
  const pos = value >= 0;
  const arc = pos ? hGrad('#16A34A', '#4ADE80') : hGrad('#EA580C', '#FB923C');
  const glow = pos ? 'rgba(34,197,94,0.45)' : 'rgba(240,108,24,0.45)';
  const option = {
    animationDuration: 1100, animationEasing: 'cubicOut',
    series: [{
      type: 'gauge', startAngle: 210, endAngle: -30, min: -1, max: 1, radius: '96%', center: ['50%', '54%'],
      progress: { show: true, width: 13, roundCap: true, itemStyle: { color: arc, shadowBlur: 16, shadowColor: glow } },
      axisLine: { lineStyle: { width: 13, color: [[1, c.track]] } },
      pointer: { show: false }, anchor: { show: false }, axisTick: { show: false }, splitLine: { show: false }, axisLabel: { show: false }, title: { show: false },
      detail: { valueAnimation: true, offsetCenter: [0, '2%'], fontSize: 26, fontWeight: 800, color: c.text,
        formatter: (v: number) => (v >= 0 ? '+' : '') + v.toFixed(2) },
      data: [{ value }],
    }],
  };
  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} opts={base} notMerge lazyUpdate />;
}

// ── Multi-series smooth glowing trend lines ───────────────────────────────────
export function TrendLines({ days, series }: { days: string[]; series: { name: string; color: string; data: number[] }[] }) {
  const c = useThemeColors();
  const option = {
    animationDuration: 900,
    grid: { left: 4, right: 10, top: 12, bottom: 20 },
    tooltip: { trigger: 'axis', backgroundColor: c.panel, borderWidth: 0, textStyle: { color: c.text, fontSize: 11 }, extraCssText: 'border-radius:10px;box-shadow:0 8px 24px rgba(2,6,23,0.18);' },
    xAxis: { type: 'category', boundaryGap: false, data: days, axisLine: { show: false }, axisTick: { show: false }, axisLabel: { color: c.mut, fontSize: 9 }, splitLine: { show: false } },
    yAxis: { type: 'value', show: false },
    series: series.map((s) => ({
      name: s.name, type: 'line', smooth: true, symbol: 'none',
      lineStyle: { width: 2.6, color: s.color, shadowBlur: 12, shadowColor: s.color + '99' },
      areaStyle: { color: vGrad(s.color + '33', s.color + '00') },
      emphasis: { focus: 'series' }, data: s.data,
    })),
  };
  return <ReactECharts option={option} style={{ height: '100%', width: '100%' }} opts={base} notMerge lazyUpdate />;
}
