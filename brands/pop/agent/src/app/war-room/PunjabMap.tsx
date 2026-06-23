'use client';

import { useMemo, useState } from 'react';
import raw from '@/data/punjab-ac.json';
import { normName } from '@/lib/war-room/constituencies';

export type ColorMode = 'heat' | 'lean' | 'issue' | 'turnout';

interface SeatStat { constituency: string; count: number; topCategory: string | null; leanScore: number; voteShare: number; }

const SAFFRON = '#F06C18';
const GREEN = '#4EB457';
const BLUE = '#6EA5D4';
const GREY = '#243B5A';
const ISSUE_COLORS: Record<string, string> = {
  jobs: '#6EA5D4', water: '#2EC4B6', power: '#F0B429', roads: '#9B8CFF',
  drugs: '#FF5D73', farm_debt: '#4EB457', health: '#F06C18', education: '#C77DFF', other: '#7A8AA0',
};

function mix(a: string, b: string, t: number): string {
  const pa = a.replace('#', '').match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const pb = b.replace('#', '').match(/\w\w/g)!.map((h) => parseInt(h, 16));
  return '#' + pa.map((x, i) => Math.round(x + (pb[i] - x) * t).toString(16).padStart(2, '0')).join('');
}

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

  const stat = useMemo(() => {
    const m = new Map<string, SeatStat>();
    byConstituency.forEach((s) => m.set(normName(s.constituency), s));
    return m;
  }, [byConstituency]);
  const maxCount = Math.max(1, ...byConstituency.map((s) => s.count));
  const pulseNorm = pulseSeat ? normName(pulseSeat) : null;
  const selNorm = selected ? normName(selected) : null;

  const fillFor = (s: SeatStat | undefined): string => {
    if (!s || s.count === 0) return GREY;
    switch (mode) {
      case 'heat': return mix('#0C2543', SAFFRON, 0.2 + 0.8 * (s.count / maxCount));
      case 'lean': { const t = (s.leanScore + 1) / 2; return t < 0.5 ? mix(SAFFRON, '#7A8AA0', t * 2) : mix('#7A8AA0', GREEN, (t - 0.5) * 2); }
      case 'issue': return ISSUE_COLORS[s.topCategory || 'other'] || ISSUE_COLORS.other;
      case 'turnout': return mix('#0C2543', BLUE, 0.2 + 0.8 * (s.voteShare / 100));
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
              stroke={isSel ? '#fff' : 'rgba(6,24,46,0.85)'}
              strokeWidth={isSel ? 2.4 : 0.6}
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
            <circle cx={hover.x} cy={hover.y} r={3} fill="#fff" />
          </g>
        )}
      </svg>
      {hover && (
        <div style={{ position: 'absolute', left: `${(hover.x / W) * 100}%`, top: `${(hover.y / H) * 100}%`, transform: 'translate(-50%,-130%)', background: 'rgba(6,24,46,0.95)', border: '1px solid rgba(234,241,251,0.2)', borderRadius: 6, padding: '4px 8px', fontSize: 11, whiteSpace: 'nowrap', pointerEvents: 'none', zIndex: 5 }}>
          <strong>{hover.name}</strong> · {hover.count} voices<br />
          <span style={{ color: 'rgba(234,241,251,0.55)' }}>{hover.district}</span>
        </div>
      )}
    </div>
  );
}
