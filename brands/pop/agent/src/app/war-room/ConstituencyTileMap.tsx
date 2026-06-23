'use client';

import { CONSTITUENCIES, type Region } from '@/lib/war-room/constituencies';

export type ColorMode = 'heat' | 'lean' | 'issue' | 'turnout';

interface SeatStat {
  constituency: string;
  count: number;
  topCategory: string | null;
  leanScore: number; // -1 (opposed) .. +1 (supporter)
  voteShare: number; // 0..100
}

const SAFFRON = '#F06C18';
const GREEN = '#4EB457';
const MUT = 'rgba(234,241,251,0.62)';
const LINE = 'rgba(234,241,251,0.10)';

const ISSUE_COLORS: Record<string, string> = {
  jobs: '#6EA5D4', water: '#2EC4B6', power: '#F0B429', roads: '#9B8CFF',
  drugs: '#FF5D73', farm_debt: '#4EB457', health: '#F06C18', education: '#C77DFF', other: '#7A8AA0',
};
const REGIONS: Region[] = ['Majha', 'Doaba', 'Malwa'];

function mix(a: string, b: string, t: number): string {
  const pa = a.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const pb = b.match(/\w\w/g)!.map((h) => parseInt(h, 16));
  const r = pa.map((x, i) => Math.round(x + (pb[i] - x) * t));
  return `#${r.map((x) => x.toString(16).padStart(2, '0')).join('')}`;
}

function tileColor(mode: ColorMode, s: SeatStat | undefined, maxCount: number): string {
  if (!s || s.count === 0) return 'rgba(255,255,255,0.05)';
  switch (mode) {
    case 'heat': {
      const t = 0.2 + 0.8 * (s.count / Math.max(1, maxCount));
      return mix('06182E', SAFFRON, t);
    }
    case 'lean': {
      // -1 opposed (saffron) → 0 undecided (grey) → +1 supporter (green)
      const t = (s.leanScore + 1) / 2;
      return t < 0.5 ? mix(SAFFRON, '7A8AA0', t * 2) : mix('7A8AA0', GREEN, (t - 0.5) * 2);
    }
    case 'issue':
      return ISSUE_COLORS[s.topCategory || 'other'] || ISSUE_COLORS.other;
    case 'turnout':
      return mix('06182E', '6EA5D4', 0.2 + 0.8 * (s.voteShare / 100));
  }
}

export default function ConstituencyTileMap({
  mode, byConstituency, pulseSeat, selected, onSelect,
}: {
  mode: ColorMode;
  byConstituency: SeatStat[];
  pulseSeat: string | null;
  selected: string | null;
  onSelect: (name: string) => void;
}) {
  const stat = new Map(byConstituency.map((s) => [s.constituency, s]));
  const maxCount = Math.max(1, ...byConstituency.map((s) => s.count));

  return (
    <div>
      {REGIONS.map((region) => {
        const seats = CONSTITUENCIES.filter((c) => c.region === region);
        return (
          <div key={region} style={{ marginBottom: 14 }}>
            <div style={{ fontSize: 11, color: MUT, marginBottom: 6, letterSpacing: '0.04em' }}>
              {region.toUpperCase()} · {seats.length} seats
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(34px,1fr))', gap: 4 }}>
              {seats.map((c) => {
                const s = stat.get(c.name);
                const isSel = selected === c.name;
                const isPulse = pulseSeat === c.name;
                return (
                  <button
                    key={c.id}
                    title={`${c.name} · ${c.district}${s ? ` · ${s.count} voices` : ''}`}
                    onClick={() => onSelect(c.name)}
                    style={{
                      aspectRatio: '1', borderRadius: 6, cursor: 'pointer',
                      background: tileColor(mode, s, maxCount),
                      border: isSel ? `2px solid #fff` : `1px solid ${LINE}`,
                      boxShadow: isPulse ? `0 0 0 3px ${GREEN}` : 'none',
                      animation: isPulse ? 'wr-tile-pulse 0.9s ease 2' : 'none',
                      position: 'relative', padding: 0, overflow: 'hidden',
                      transition: 'transform 0.1s',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.transform = 'scale(1.12)')}
                    onMouseLeave={(e) => (e.currentTarget.style.transform = 'scale(1)')}
                  >
                    <span style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', fontSize: 8, color: 'rgba(255,255,255,0.55)', fontWeight: 700 }}>
                      {s && s.count > 0 ? s.count : ''}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}

      {/* legend */}
      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', fontSize: 10, color: MUT, marginTop: 4 }}>
        {mode === 'issue'
          ? Object.entries(ISSUE_COLORS).map(([k, v]) => (
              <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 4, textTransform: 'capitalize' }}>
                <span style={{ width: 9, height: 9, borderRadius: 2, background: v }} /> {k.replace('_', ' ')}
              </span>
            ))
          : (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {mode === 'heat' ? 'Low' : mode === 'lean' ? 'Opposed' : 'Low'}
              <span style={{ width: 90, height: 9, borderRadius: 4, background: mode === 'lean' ? `linear-gradient(90deg, ${SAFFRON}, #7A8AA0, ${GREEN})` : `linear-gradient(90deg, rgba(255,255,255,0.05), ${mode === 'turnout' ? '#6EA5D4' : SAFFRON})` }} />
              {mode === 'heat' ? 'High' : mode === 'lean' ? 'Supporter' : 'High'}
            </span>
          )}
      </div>
      <style>{`@keyframes wr-tile-pulse{0%{transform:scale(1)}50%{transform:scale(1.25)}100%{transform:scale(1)}}`}</style>
    </div>
  );
}
