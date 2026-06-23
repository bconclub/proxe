'use client';

import { useEffect, useMemo, useState } from 'react';
import raw from '@/data/punjab-ac.json';
import { normName } from '@/lib/war-room/constituencies';

export type ColorMode = 'heat' | 'lean' | 'issue' | 'turnout';

interface SeatStat { constituency: string; count: number; topCategory: string | null; leanScore: number; voteShare: number; }

const SAFFRON = '#F06C18';
const GREEN = '#4EB457';
const BLUE = '#3B82F6';
// Issue (categorical) palette — slightly desaturated so it reads clean on white.
const ISSUE_COLORS: Record<string, string> = {
  jobs: '#3B82F6', water: '#14B8A6', power: '#F59E0B', roads: '#8B7BFF',
  drugs: '#F43F5E', farm_debt: '#22A152', health: '#F06C18', education: '#A855F7', other: '#94A3B8',
};

function mix(a: string, b: string, t: number): string {
  const pa = a.replace('#', '').match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const pb = b.replace('#', '').match(/\w\w/g)!.map((h) => parseInt(h, 16));
  return '#' + pa.map((x, i) => Math.round(x + (pb[i] - x) * t).toString(16).padStart(2, '0')).join('');
}

// Relative luminance of a hex color → decide if the app theme is light.
function isLightHex(hex: string): boolean {
  const m = hex.replace('#', '').match(/\w\w/g);
  if (!m) return true;
  const [r, g, b] = m.map((h) => parseInt(h, 16));
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255 > 0.5;
}

// Theme-aware map palettes. Light: empty seats fade to near-white and each mode
// ramps within ONE clean hue (proper choropleth — intensity = saturation, not
// darkness). Dark: keep depth against the black canvas.
const LIGHT_P = {
  empty: '#EAEDF1', heatLo: '#FFE0C2', heatHi: '#E2570A',
  turnLo: '#DCEBFB', turnHi: '#2563EB', leanMid: '#CBD5E1',
  stroke: 'rgba(15,23,42,0.16)', sel: '#0F172A', dot: '#0F172A',
};
const DARK_P = {
  empty: '#16263C', heatLo: '#16273D', heatHi: SAFFRON,
  turnLo: '#16273D', turnHi: BLUE, leanMid: '#46566E',
  stroke: 'rgba(255,255,255,0.10)', sel: '#FFFFFF', dot: '#FFFFFF',
};

// ── project GeoJSON → SVG paths once (equirectangular, aspect-corrected) ──────
const features = (raw as any).features as { properties: { no: number; name: string; district: string }; geometry: any }[];
const MID_LAT = 31.0;
const KX = Math.cos((MID_LAT * Math.PI) / 180);
let minLng = 999, maxLng = -999, minLat = 999, maxLat = -999;
features.forEach((f) => {
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  polys.forEach((poly: any) => poly.forEach((ring: any) => ring.forEach(([lng, lat]: number[]) => {
    if (lng < minLng) minLng = lng; if (lng > maxLng) maxLng = lng;
    if (lat < minLat) minLat = lat; if (lat > maxLat) maxLat = lat;
  })));
});
const W = 1000;
const FACTOR = W / ((maxLng - minLng) * KX);
const H = (maxLat - minLat) * FACTOR;
const px = (lng: number) => (lng - minLng) * KX * FACTOR;
const py = (lat: number) => (maxLat - lat) * FACTOR;

const PATHS: { no: number; name: string; district: string; d: string; cx: number; cy: number }[] = features.map((f) => {
  const polys = f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [f.geometry.coordinates];
  let d = '';
  let sx = 0, sy = 0, n = 0;
  polys.forEach((poly: any) => poly.forEach((ring: any) => {
    ring.forEach(([lng, lat]: number[], i: number) => {
      const x = px(lng), y = py(lat);
      d += (i === 0 ? 'M' : 'L') + x.toFixed(1) + ' ' + y.toFixed(1);
      sx += x; sy += y; n++;
    });
    d += 'Z';
  }));
  return { no: f.properties.no, name: f.properties.name, district: f.properties.district, d, cx: sx / n, cy: sy / n };
});

export default function PunjabMap({
  mode, byConstituency, pulseSeat, selected, onSelect,
}: {
  mode: ColorMode;
  byConstituency: SeatStat[];
  pulseSeat: string | null;
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  const [hover, setHover] = useState<{ name: string; district: string; count: number; x: number; y: number } | null>(null);

  // Follow the app theme (light/dark) so the map palette stays clean on both.
  const [light, setLight] = useState(true);
  useEffect(() => {
    const read = () => {
      const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim();
      if (bg) setLight(isLightHex(bg));
    };
    read();
    const obs = new MutationObserver(read);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme', 'class', 'style'] });
    return () => obs.disconnect();
  }, []);
  const P = light ? LIGHT_P : DARK_P;

  const stat = useMemo(() => {
    const m = new Map<string, SeatStat>();
    byConstituency.forEach((s) => m.set(normName(s.constituency), s));
    return m;
  }, [byConstituency]);
  const maxCount = Math.max(1, ...byConstituency.map((s) => s.count));
  const pulseNorm = pulseSeat ? normName(pulseSeat) : null;
  const selNorm = selected ? normName(selected) : null;

  const fillFor = (s: SeatStat | undefined): string => {
    if (!s || s.count === 0) return P.empty;
    switch (mode) {
      case 'heat': return mix(P.heatLo, P.heatHi, 0.18 + 0.82 * (s.count / maxCount));
      case 'lean': { const t = (s.leanScore + 1) / 2; return t < 0.5 ? mix(SAFFRON, P.leanMid, t * 2) : mix(P.leanMid, GREEN, (t - 0.5) * 2); }
      case 'issue': return ISSUE_COLORS[s.topCategory || 'other'] || ISSUE_COLORS.other;
      case 'turnout': return mix(P.turnLo, P.turnHi, 0.18 + 0.82 * (s.voteShare / 100));
    }
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 0 }}>
      <svg viewBox={`-8 -8 ${W + 16} ${H + 16}`} style={{ width: '100%', height: '100%', display: 'block' }} preserveAspectRatio="xMidYMid meet">
        {PATHS.map((p) => {
          const s = stat.get(normName(p.name));
          const isSel = selNorm === normName(p.name);
          const isPulse = pulseNorm === normName(p.name);
          return (
            <path
              key={p.no}
              d={p.d}
              fill={fillFor(s)}
              stroke={isSel ? P.sel : P.stroke}
              strokeWidth={isSel ? 2.2 : 0.5}
              style={{ cursor: 'pointer', transition: 'fill 0.25s', filter: isPulse ? 'drop-shadow(0 0 6px #4EB457)' : undefined }}
              onMouseEnter={(e) => setHover({ name: p.name, district: p.district, count: s?.count || 0, x: p.cx, y: p.cy })}
              onMouseLeave={() => setHover(null)}
              onClick={() => onSelect(p.name)}
            >
              {isPulse && <animate attributeName="opacity" values="1;0.4;1" dur="0.7s" repeatCount="3" />}
            </path>
          );
        })}
        {hover && (
          <g pointerEvents="none">
            <circle cx={hover.x} cy={hover.y} r={3} fill={P.dot} />
          </g>
        )}
      </svg>
      {hover && (
        <div style={{ position: 'absolute', left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%`, transform: 'translate(-50%,-130%)', background: 'var(--bg-secondary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', borderRadius: 6, padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 5, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
          <strong>{hover.name}</strong> · {hover.count} voices<br />
          <span style={{ color: 'var(--text-secondary)' }}>{hover.district}</span>
        </div>
      )}
    </div>
  );
}
