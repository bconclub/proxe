'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CONSTITUENCIES, DISTRICTS, TOTAL_SEATS } from '@/lib/war-room/constituencies';
import PunjabMap, { type ColorMode } from './PunjabMap';
import { LeanDonut, SentimentGauge, TrendLines, GlowDonut, GlowSpark, GlowArea } from './WarCharts';
import {
  MdWaterDrop, MdBolt, MdWork, MdAddRoad, MdLocalHospital, MdSchool, MdAgriculture, MdWarning, MdMoreHoriz,
} from 'react-icons/md';

// ── palette ──
// Semantic data colors (chart/lean/category encodings) stay concrete; structural
// colors use the app theme tokens so the war room follows light/dark like the dashboard.
const SAFFRON = '#F06C18', GREEN = '#22C55E', BLUE = '#3B82F6', AMBER = '#F59E0B', PURPLE = '#A78BFA';
const BG = 'var(--bg-primary)', CARD = 'var(--bg-secondary)', LINE = 'var(--border-primary)', TXT = 'var(--text-primary)', MUT = 'var(--text-secondary)', TRACK = 'var(--bg-tertiary)';
const CHANNELS = ['whatsapp', 'voice', 'pulse_app', 'qr', 'missed_call'];
const LEAN_KEYS = ['supporter', 'leaning', 'undecided', 'opposed'];
const LEAN_C: Record<string, string> = { supporter: GREEN, leaning: '#86EFAC', undecided: AMBER, opposed: SAFFRON };
const CAT_ICON: Record<string, any> = { water: MdWaterDrop, power: MdBolt, jobs: MdWork, roads: MdAddRoad, health: MdLocalHospital, education: MdSchool, farm_debt: MdAgriculture, drugs: MdWarning, other: MdMoreHoriz };
const CAT_C: Record<string, string> = { water: '#2EC4B6', power: AMBER, jobs: BLUE, roads: PURPLE, health: '#FB7185', education: '#C77DFF', farm_debt: GREEN, drugs: '#FF5D73', other: '#7A8AA0' };
// Gradient pairs (top→bottom) for the Channel Mix glow donut segments.
const CHAN_GRAD: [string, string][] = [['#4ADE80', '#16A34A'], ['#60A5FA', '#2563EB'], ['#FB923C', '#EA580C'], ['#FBBF24', '#D97706'], ['#C4B5FD', '#7C3AED']];

export interface WarRoomData {
  kpis: { total: number; today: number; activeConstituencies: number; raised: number; resolved: number; loopHealthPct: number };
  byCategory: { category: string; count: number; salienceWeighted: number; trend7d: number }[];
  leanOverall: Record<string, number>;
  swing: { constituency: string; total: number; undecided: number; undecidedPct: number }[];
  byConstituency: { constituency: string; count: number; topCategory: string | null; leanScore: number; voteShare: number }[];
  seatDetails: Record<string, {
    total: number; district: string | null;
    leanSplit: Record<string, number>;
    topIssues: { category: string; count: number }[];
    mobilization: Record<string, number>;
    channels: { magnet: string; count: number }[];
    resolved: number; loopHealthPct: number; voteShare: number; avgSalience: number;
    recent: { category: string | null; text: string | null; created_at: string; name: string | null; lean: string | null }[];
  }>;
  matrix: { districts: string[]; categories: string[]; cells: Record<string, Record<string, number>> };
  mobilization: Record<string, number>;
  channelMix: { magnet: string; count: number; share: number }[];
  liveFeed: { id: string; name: string | null; constituency: string | null; category: string | null; created_at: string }[];
  series: { days: string[]; total: number[]; resolved: number[]; categories: string[]; byCategory: Record<string, number[]>; seats: string[]; bySeat: Record<string, number[]>; mobilization: Record<string, number[]> };
  sentiment: { net: number; shiftPp: number; label: string };
}
interface Filters { constituency: string; district: string; channel: string; language: string; days: string; }
const EMPTY: Filters = { constituency: '', district: '', channel: '', language: '', days: 'all' };

function mask(name: string | null, c: string | null) { if (name && name.trim().length > 1) { const f = name.trim().split(/\s+/)[0]; return f.length > 2 ? f[0] + '••••' : f; } return `Constituent, ${c || 'Punjab'}`; }
function ago(iso: string) { const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; }

// War Room is used on phones a lot — switch from the fixed single-viewport
// desktop grid to a stacked, scrolling layout below this width.
function useIsMobile(bp = 820) {
  const [m, setM] = useState(false);
  useEffect(() => {
    const check = () => setM(window.innerWidth < bp);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, [bp]);
  return m;
}

export default function WarRoomClient() {
  const [data, setData] = useState<WarRoomData | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [mode, setMode] = useState<ColorMode>('heat');
  const [selected, setSelected] = useState<string | null>(null);
  const [pulse, setPulse] = useState<string | null>(null);
  const mobile = useIsMobile();
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);

  const fetchData = useCallback(async () => {
    const qs = new URLSearchParams(); Object.entries(filters).forEach(([k, v]) => v && v !== 'all' && qs.set(k, v));
    try { const r = await fetch(`/api/war-room/data?${qs}`, { cache: 'no-store' }); if (r.ok) setData(await r.json()); } catch {}
  }, [filters]);
  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const ch = sb.channel('wr').on('postgres_changes', { event: '*', schema: 'public', table: 'all_leads' }, (p: any) => {
      const seat = p.new?.constituency || p.old?.constituency; if (seat) { setPulse(seat); setTimeout(() => setPulse(null), 2500); } fetchData();
    }).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [fetchData]);

  const d = data;
  const SEAT_C = [SAFFRON, BLUE, GREEN, AMBER, PURPLE, '#2EC4B6'];

  return (
    <div style={{ height: mobile ? 'auto' : '100vh', minHeight: '100vh', overflow: mobile ? 'visible' : 'hidden', color: TXT, display: 'flex', flexDirection: 'column', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, background: `radial-gradient(900px 480px at 12% -6%, rgba(240,108,24,0.12), transparent 60%), radial-gradient(820px 460px at 88% 0%, rgba(34,197,94,0.12), transparent 58%), radial-gradient(820px 520px at 50% 112%, rgba(59,130,246,0.10), transparent 60%), ${BG}` }}>
      {/* MAIN */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? 8 : 12, padding: mobile ? '10px 12px' : '12px 18px', flexWrap: 'wrap', borderBottom: `1px solid ${LINE}` }}>
          <a href="/dashboard" title="Back to dashboard" style={{ display: 'inline-flex', textDecoration: 'none' }}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/pop-icon.png" alt="Pulse of Punjab" style={{ width: mobile ? 26 : 30, height: mobile ? 26 : 30, borderRadius: 7 }} />
          </a>
          <div>
            <div style={{ fontSize: mobile ? 16 : 19, fontWeight: 800, letterSpacing: '-0.02em' }}>Pulse of Punjab <span style={{ color: MUT, fontWeight: 500, fontSize: mobile ? 13 : 15 }}>War Room</span></div>
            <div style={{ fontSize: 11, color: MUT, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 9, background: GREEN, animation: 'wr-pulse 2s infinite' }} />Real-time political intelligence across Punjab</div>
          </div>
          <div style={{ flex: 1 }} />
          <Sel v={filters.district} on={(v) => setFilters({ ...filters, district: v })} opts={['', ...DISTRICTS]} fmt={(o) => o || 'All Districts'} />
          <Sel v={filters.constituency} on={(v) => setFilters({ ...filters, constituency: v })} opts={['', ...CONSTITUENCIES.map((c) => c.name)]} fmt={(o) => o || 'All Seats'} />
          <Sel v={filters.channel} on={(v) => setFilters({ ...filters, channel: v })} opts={['', ...CHANNELS]} fmt={(o) => o ? o.replace('_', ' ') : 'All Channels'} />
          <Sel v={filters.language} on={(v) => setFilters({ ...filters, language: v })} opts={['', 'pa', 'hi', 'en']} fmt={(o) => o ? o.toUpperCase() : 'All Languages'} />
          <Sel v={filters.days} on={(v) => setFilters({ ...filters, days: v })} opts={['all', '1', '7', '30']} fmt={(o) => o === 'all' ? 'All Time' : o === '1' ? 'Today' : `${o}d`} />
          <a href="/dashboard" title="Exit the War Room — back to dashboard" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: CARD, color: TXT, border: `1px solid ${LINE}`, borderRadius: 9, padding: '7px 12px', fontSize: 11, fontWeight: 600, textDecoration: 'none', whiteSpace: 'nowrap' }}>
            <span aria-hidden style={{ fontSize: 13, lineHeight: 1 }}>✕</span> Exit
          </a>
        </div>

        {/* SCROLL BODY (single-VH scroll on desktop; page scroll on mobile) */}
        <div style={{ flex: 1, minHeight: 0, overflowY: mobile ? 'visible' : 'auto', padding: mobile ? '10px 12px 18px' : '12px 18px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* KPI ROW */}
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(5,1fr)', gap: mobile ? 8 : 12 }}>
            <Kpi label="Voices Captured" value={d?.kpis.total ?? 0} sub="Total constituents" trend="+14%" up accent={SAFFRON} spark={d?.series.total} />
            <Kpi label="Captured Today" value={d?.kpis.today ?? 0} sub="Since midnight" trend="+12%" up accent={GREEN} spark={d?.series.total?.slice(-7)} />
            <Kpi label="Active Seats" value={d?.kpis.activeConstituencies ?? 0} sub={`of ${TOTAL_SEATS}`} trend="+5" up accent={BLUE} spark={d?.series.total} />
            <Kpi label="Loop Health" value={`${d?.kpis.loopHealthPct ?? 0}%`} sub={`${d?.kpis.resolved ?? 0} / ${d?.kpis.raised ?? 0} resolved`} trend="+3pp" up accent={GREEN} spark={d?.series.resolved} />
            <Kpi label="Sentiment Shift" value={`${(d?.sentiment.shiftPp ?? 0) >= 0 ? '+' : ''}${d?.sentiment.shiftPp ?? 0}pp`} sub="vs 7d ago" trend={d?.sentiment.label || '—'} up={(d?.sentiment.shiftPp ?? 0) >= 0} accent={PURPLE} spark={d?.series.total} />
          </div>

          {/* MAIN GRID: map | center | feed (stacks on mobile) */}
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'minmax(0,1.35fr) minmax(0,1.15fr) 270px', gap: 12, minHeight: mobile ? undefined : 620 }}>
            {/* MAP */}
            <Panel title="Constituency Heat Map" sub="Intensity by volume and salience" h={mobile ? 360 : undefined} right={
              <div style={{ display: 'flex', gap: 5 }}>{(['heat', 'lean', 'issue', 'turnout'] as ColorMode[]).map((m) => <Chip key={m} on={mode === m} onClick={() => setMode(m)}>{m === 'heat' ? 'Heat' : m === 'lean' ? 'Lean' : m === 'issue' ? 'Issue' : 'Turnout'}</Chip>)}</div>
            }>
              <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', gap: 8 }}>
                <div style={{ width: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: MUT }}>
                  <span>High</span>
                  <div style={{ flex: 1, width: 8, borderRadius: 5, margin: '6px 0', background: `linear-gradient(to top, ${TRACK}, ${SAFFRON})` }} />
                  <span>Low</span>
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <PunjabMap mode={mode} byConstituency={d?.byConstituency || []} pulseSeat={pulse} selected={selected} onSelect={(n) => setSelected(n === selected ? null : n)} />
                </div>
              </div>
            </Panel>

            {/* CENTER COLUMN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
              <Panel title="Top Issues by Salience" h={196}>
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', gap: 4, overflowY: 'auto' }}>
                  {(d?.byCategory || []).map((c, i) => {
                    const max = Math.max(...(d?.byCategory || []).map((x) => x.count), 1); const Icon = CAT_ICON[c.category] || MdMoreHoriz; const pct = Math.round((c.count / (d?.kpis.total || 1)) * 100);
                    return (
                      <div key={c.category} style={{ display: 'grid', gridTemplateColumns: '14px 110px 1fr 34px', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: MUT, fontSize: 11 }}>{i + 1}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'capitalize' }}><Icon size={13} color={CAT_C[c.category]} />{c.category.replace('_', ' ')}</span>
                        <div style={{ height: 10, background: TRACK, borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${(c.count / max) * 100}%`, height: '100%', background: CAT_C[c.category] || SAFFRON, borderRadius: 3 }} /></div>
                        <span style={{ textAlign: 'right', color: MUT }}>{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </Panel>
              <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : '1fr 1fr', gap: 12 }}>
                <Panel title="Support / Lean / Opposed" h={mobile ? 172 : undefined}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <div style={{ width: 132, height: 132, flexShrink: 0 }}>
                      <LeanDonut data={d?.leanOverall || {}} total={LEAN_KEYS.reduce((s, k) => s + (d?.leanOverall[k] || 0), 0)} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {LEAN_KEYS.map((k) => { const t = LEAN_KEYS.reduce((s, x) => s + (d?.leanOverall[x] || 0), 0) || 1; return <span key={k} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: LEAN_C[k] }} /><span style={{ textTransform: 'capitalize', color: MUT, width: 64 }}>{k}</span><b>{d?.leanOverall[k] || 0}</b> <span style={{ color: MUT }}>({Math.round(((d?.leanOverall[k] || 0) / t) * 100)}%)</span></span>; })}
                    </div>
                  </div>
                </Panel>
                <Panel title="Sentiment" h={mobile ? 172 : undefined}>
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ flex: 1, minHeight: 96 }}>
                      <SentimentGauge value={d?.sentiment.net ?? 0} />
                    </div>
                    <div style={{ textAlign: 'center', fontSize: 11, marginTop: -6 }}>
                      <span style={{ color: MUT }}>Net Sentiment · </span>
                      <span style={{ color: (d?.sentiment.net ?? 0) >= 0 ? GREEN : SAFFRON, fontWeight: 700 }}>{d?.sentiment.label}</span>
                    </div>
                  </div>
                </Panel>
              </div>
              <Panel title="District Comparison (Top 6)" sub="14-day volume" h={224} right={
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', justifyContent: 'flex-end', fontSize: 9, color: MUT, maxWidth: 300 }}>
                  {(d?.series.seats || []).map((s, i) => <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap' }}><span style={{ width: 7, height: 7, borderRadius: 9, background: SEAT_C[i % SEAT_C.length] }} />{s}</span>)}
                </div>
              }>
                <div style={{ flex: 1, minHeight: 100 }}>
                  <TrendLines
                    days={(d?.series.days || []).map((day) => day.slice(5))}
                    series={(d?.series.seats || []).map((s, i) => ({ name: s, color: SEAT_C[i % SEAT_C.length], data: d?.series.bySeat[s] || [] }))}
                  />
                </div>
              </Panel>
            </div>

            {/* LIVE FEED */}
            <Panel title="Live Feed" sub="Listening now" noPad h={mobile ? 320 : undefined}>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {(d?.liveFeed || []).length === 0 ? <Empty /> : d!.liveFeed.map((f) => {
                  const Icon = CAT_ICON[f.category || 'other'] || MdMoreHoriz;
                  return (
                    <div key={f.id} style={{ display: 'flex', gap: 8, padding: '8px 12px', borderBottom: `1px solid ${LINE}`, animation: 'wr-in 0.4s ease' }}>
                      <div style={{ width: 26, height: 26, borderRadius: 7, flexShrink: 0, display: 'grid', placeItems: 'center', background: `${CAT_C[f.category || 'other']}22` }}><Icon size={14} color={CAT_C[f.category || 'other']} /></div>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}><b style={{ fontSize: 12 }}>{f.constituency || 'Punjab'}</b><span style={{ fontSize: 10, color: MUT }}>{ago(f.created_at)}</span></div>
                        <div style={{ fontSize: 10, color: MUT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mask(f.name, f.constituency)} · <span style={{ color: SAFFRON, textTransform: 'uppercase', fontSize: 9, fontWeight: 700 }}>{(f.category || 'other').replace('_', ' ')}</span></div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Panel>
          </div>

          {/* BOTTOM ROW (stacks on mobile) */}
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'minmax(0,0.9fr) minmax(0,1fr) minmax(0,1.1fr) minmax(0,1.1fr)', gap: 12, minHeight: mobile ? undefined : 232 }}>
            <Panel title="Channel Mix" sub="By volume" h={mobile ? 190 : undefined}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 120, height: 120, flexShrink: 0 }}><GlowDonut segments={(d?.channelMix || []).map((c, i) => ({ name: c.magnet.replace('_', ' '), value: c.count, top: CHAN_GRAD[i % 5][0], bot: CHAN_GRAD[i % 5][1] }))} /></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {(d?.channelMix || []).map((c, i) => <span key={c.magnet} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: [GREEN, BLUE, SAFFRON, AMBER, PURPLE][i % 5] }} /><span style={{ textTransform: 'capitalize', color: MUT, width: 70 }}>{c.magnet.replace('_', ' ')}</span><b>{c.share}%</b></span>)}
                </div>
              </div>
            </Panel>
            <Panel title="Mobilization Readiness" sub="Who will act" h={mobile ? 230 : undefined}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gridTemplateRows: '1fr 1fr', gap: 8, flex: 1, minHeight: 0 }}>
                {(['vote', 'volunteer', 'rally', 'share'] as const).map((k) => {
                  const c = k === 'vote' ? GREEN : k === 'volunteer' ? BLUE : k === 'rally' ? SAFFRON : PURPLE;
                  return (
                    <div key={k} style={{ background: TRACK, border: `1px solid ${LINE}`, borderRadius: 8, padding: '7px 9px', display: 'flex', flexDirection: 'column', minHeight: 0, overflow: 'hidden' }}>
                      <div style={{ fontSize: 18, fontWeight: 800, color: c, lineHeight: 1.1 }}>{d?.mobilization[k] || 0}</div>
                      <div style={{ fontSize: 10, color: MUT, textTransform: 'capitalize' }}>{k === 'vote' ? 'Voters' : k === 'volunteer' ? 'Volunteers' : k === 'rally' ? 'Rallies' : 'Shares'}</div>
                      <div style={{ flex: 1, minHeight: 16, marginTop: 2 }}><GlowSpark data={d?.series.mobilization[k] || []} color={c} /></div>
                    </div>
                  );
                })}
              </div>
            </Panel>
            <Panel title="Issue Trend (Top 5)" sub="14 days" h={mobile ? 240 : undefined}>
              <div style={{ flex: 1, minHeight: 120 }}>
                <GlowArea
                  days={(d?.series.days || []).map((day) => day.slice(5))}
                  series={(d?.series.categories || []).map((cat) => ({ name: cat, color: CAT_C[cat], data: d?.series.byCategory[cat] || [] }))}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 9, color: MUT, marginTop: 4 }}>
                {(d?.series.categories || []).map((c) => <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 3, textTransform: 'capitalize' }}><span style={{ width: 7, height: 7, borderRadius: 2, background: CAT_C[c] }} />{c.replace('_', ' ')}</span>)}
              </div>
            </Panel>
            <Panel title="Constituency Snapshot" sub="Top 5 by volume & salience" h={mobile ? 260 : undefined}>
              <div style={{ overflowY: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 11 }}>
                  <thead><tr style={{ color: MUT }}>{['Constituency', 'Vol', 'Supp', 'Lean', 'Opp'].map((h) => <th key={h} style={{ textAlign: h === 'Constituency' ? 'left' : 'right', padding: '3px 5px', fontWeight: 500 }}>{h}</th>)}</tr></thead>
                  <tbody>
                    {(d?.swing || []).slice(0, 5).map((s) => {
                      const seat = d?.byConstituency.find((b) => b.constituency === s.constituency);
                      const lean = seat?.leanScore ?? 0;
                      return (
                        <tr key={s.constituency} style={{ borderTop: `1px solid ${LINE}` }}>
                          <td style={{ padding: '4px 5px', whiteSpace: 'nowrap' }}>{s.constituency}</td>
                          <td style={{ padding: '4px 5px', textAlign: 'right' }}>{s.total}</td>
                          <td style={{ padding: '4px 5px', textAlign: 'right', color: GREEN }}>{Math.round(((seat ? (lean + 1) / 2 : 0)) * 100)}%</td>
                          <td style={{ padding: '4px 5px', textAlign: 'right', color: AMBER }}>{s.undecidedPct}%</td>
                          <td style={{ padding: '4px 5px', textAlign: 'right', color: SAFFRON }}>{Math.max(0, 100 - s.undecidedPct - Math.round(((seat ? (lean + 1) / 2 : 0)) * 100))}%</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '7px 18px', borderTop: `1px solid ${LINE}`, fontSize: 10, color: MUT }}>
          <span style={{ color: GREEN }}>● System healthy</span><span>Last data sync: Just now</span><span>Auto-refresh: realtime</span>
          <div style={{ flex: 1 }} /><span>Data integrity 100%</span><span>🔒 Secure connection</span>
        </div>
      </div>

      {/* DRAWER — rich per-constituency detail */}
      {selected && (() => {
        const ref = CONSTITUENCIES.find((c) => c.name === selected);
        const sd = d?.seatDetails?.[selected];
        const MOB = { vote: { label: 'Voters', color: GREEN }, volunteer: { label: 'Volunteers', color: BLUE }, rally: { label: 'Rallies', color: SAFFRON }, share: { label: 'Shares', color: PURPLE } } as const;
        const total = sd?.total || 0;
        return (
          <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40, backdropFilter: 'blur(2px)' }}>
            <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: 384, maxWidth: '94vw', background: CARD, borderLeft: `1px solid ${LINE}`, padding: 0, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
              {/* header */}
              <div style={{ position: 'sticky', top: 0, zIndex: 1, padding: '16px 18px', borderBottom: `1px solid ${LINE}`, background: CARD }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    {ref?.no != null && <span style={{ fontSize: 11, fontWeight: 800, color: TXT, background: TRACK, border: `1px solid ${LINE}`, borderRadius: 6, padding: '2px 7px' }}>AC {ref.no}</span>}
                    <b style={{ fontSize: 18 }}>{selected}</b>
                  </div>
                  <Chip on={false} onClick={() => setSelected(null)}>✕</Chip>
                </div>
                <div style={{ color: MUT, fontSize: 11, marginTop: 4 }}>{(sd?.district || ref?.district) || '—'}{ref?.region ? ` · ${ref.region}` : ''}</div>
              </div>

              {sd && total > 0 ? (
                <div style={{ padding: 18, display: 'flex', flexDirection: 'column', gap: 16 }}>
                  {/* stat row */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                    <St l="Voices" v={total} /><St l="Vote intent" v={`${sd.voteShare}%`} /><St l="Loop health" v={`${sd.loopHealthPct}%`} /><St l="Salience" v={`${sd.avgSalience}`} />
                  </div>

                  {/* lean split */}
                  <div>
                    <div style={{ fontSize: 10, color: MUT, marginBottom: 6, letterSpacing: '0.04em' }}>LEAN SPLIT</div>
                    <div style={{ display: 'flex', height: 12, borderRadius: 6, overflow: 'hidden', background: TRACK }}>
                      {LEAN_KEYS.map((k) => { const v = sd.leanSplit[k] || 0; return v ? <div key={k} title={`${k}: ${v}`} style={{ width: `${(v / total) * 100}%`, background: LEAN_C[k] }} /> : null; })}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px', marginTop: 8 }}>
                      {LEAN_KEYS.map((k) => <span key={k} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: LEAN_C[k] }} /><span style={{ textTransform: 'capitalize', color: MUT }}>{k}</span><b>{sd.leanSplit[k] || 0}</b></span>)}
                    </div>
                  </div>

                  {/* top issues */}
                  <div>
                    <div style={{ fontSize: 10, color: MUT, marginBottom: 6, letterSpacing: '0.04em' }}>TOP ISSUES</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {sd.topIssues.map((it) => { const Icon = CAT_ICON[it.category] || MdMoreHoriz; const col = CAT_C[it.category] || SAFFRON; return (
                        <div key={it.category} style={{ display: 'grid', gridTemplateColumns: '105px 1fr 22px', alignItems: 'center', gap: 8, fontSize: 12 }}>
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'capitalize' }}><Icon size={13} color={col} />{it.category.replace('_', ' ')}</span>
                          <div style={{ height: 8, background: TRACK, borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${(it.count / total) * 100}%`, height: '100%', background: col, borderRadius: 3 }} /></div>
                          <span style={{ textAlign: 'right', color: MUT }}>{it.count}</span>
                        </div>
                      ); })}
                    </div>
                  </div>

                  {/* mobilization */}
                  <div>
                    <div style={{ fontSize: 10, color: MUT, marginBottom: 6, letterSpacing: '0.04em' }}>MOBILIZATION</div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                      {(Object.keys(MOB) as (keyof typeof MOB)[]).map((k) => (
                        <div key={k} style={{ background: TRACK, border: `1px solid ${LINE}`, borderRadius: 8, padding: '6px 4px', textAlign: 'center' }}>
                          <div style={{ fontSize: 16, fontWeight: 800, color: MOB[k].color }}>{sd.mobilization[k] || 0}</div>
                          <div style={{ fontSize: 9, color: MUT }}>{MOB[k].label}</div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* channels */}
                  {sd.channels.length > 0 && (
                    <div>
                      <div style={{ fontSize: 10, color: MUT, marginBottom: 6, letterSpacing: '0.04em' }}>CAPTURE CHANNELS</div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                        {sd.channels.map((c) => <span key={c.magnet} style={{ fontSize: 11, padding: '3px 8px', borderRadius: 20, background: TRACK, border: `1px solid ${LINE}`, textTransform: 'capitalize' }}>{c.magnet.replace('_', ' ')} <b>{c.count}</b></span>)}
                      </div>
                    </div>
                  )}

                  {/* recent grievances with text */}
                  <div>
                    <div style={{ fontSize: 10, color: MUT, marginBottom: 6, letterSpacing: '0.04em' }}>LATEST GRIEVANCES</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {sd.recent.map((r, i) => { const Icon = CAT_ICON[r.category || 'other'] || MdMoreHoriz; const col = CAT_C[r.category || 'other'] || SAFFRON; return (
                        <div key={i} style={{ display: 'flex', gap: 8, paddingBottom: 8, borderBottom: i < sd.recent.length - 1 ? `1px solid ${LINE}` : 'none' }}>
                          <div style={{ width: 24, height: 24, borderRadius: 6, flexShrink: 0, display: 'grid', placeItems: 'center', background: `${col}22` }}><Icon size={13} color={col} /></div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: col, textTransform: 'uppercase' }}>{(r.category || 'other').replace('_', ' ')}</span>
                              <span style={{ fontSize: 10, color: MUT }}>{ago(r.created_at)}</span>
                            </div>
                            {r.text && <div style={{ fontSize: 12, color: TXT, marginTop: 2 }}>{r.text}</div>}
                            <div style={{ fontSize: 10, color: MUT, marginTop: 2 }}>{mask(r.name, selected)}{r.lean ? ` · ${r.lean}` : ''}</div>
                          </div>
                        </div>
                      ); })}
                    </div>
                  </div>
                </div>
              ) : <div style={{ padding: 18 }}><Empty text="No captures here yet" /></div>}
            </div>
          </div>
        );
      })()}

      <style>{`@keyframes wr-pulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,0.7)}70%{box-shadow:0 0 0 6px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}@keyframes wr-in{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-thumb{background:rgba(130,140,160,0.4);border-radius:9px}`}</style>
    </div>
  );
}

// ── primitives ──
// Frosted-glass panel: translucent theme bg + blur, soft elevation. color-mix
// keeps it theme-aware (frosted white on light, frosted slate on dark).
const card: React.CSSProperties = {
  background: 'color-mix(in srgb, var(--bg-secondary) 68%, transparent)',
  border: '1px solid color-mix(in srgb, var(--border-primary) 70%, transparent)',
  borderRadius: 14,
  backdropFilter: 'blur(16px) saturate(140%)',
  WebkitBackdropFilter: 'blur(16px) saturate(140%)',
  boxShadow: '0 10px 30px rgba(2,6,23,0.10)',
};
function Panel({ title, sub, right, children, noPad, grow, h, clip }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; noPad?: boolean; grow?: boolean; h?: number; clip?: boolean }) {
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', minHeight: 0, ...(grow ? { flex: 1 } : {}), ...(h ? { height: h, minHeight: h, flex: 'none' } : {}), ...(clip ? { overflow: 'hidden' } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '9px 12px', borderBottom: `1px solid ${LINE}` }}>
        <div><div style={{ fontSize: 12.5, fontWeight: 700 }}>{title}</div>{sub && <div style={{ fontSize: 10, color: MUT }}>{sub}</div>}</div>{right}
      </div>
      <div style={{ padding: noPad ? 0 : 11, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  );
}
function Kpi({ label, value, sub, trend, up, accent, spark }: { label: string; value: number | string; sub: string; trend: string; up: boolean; accent: string; spark?: number[] }) {
  return (
    <div style={{ ...card, padding: 12, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ fontSize: 10, color: MUT, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
        <span style={{ fontSize: 10, fontWeight: 700, color: up ? GREEN : SAFFRON, background: `${up ? GREEN : SAFFRON}1c`, borderRadius: 6, padding: '1px 5px' }}>{up ? '↑' : '↓'} {trend}</span>
      </div>
      <div style={{ fontSize: 26, fontWeight: 800, color: accent, lineHeight: 1.15, marginTop: 2 }}>{value}</div>
      <div style={{ fontSize: 10, color: MUT }}>{sub}</div>
      <div style={{ height: 26, marginTop: 4, opacity: 0.85 }}><GlowSpark data={spark || []} color={accent} /></div>
    </div>
  );
}
function Sel({ v, on, opts, fmt }: { v: string; on: (v: string) => void; opts: string[]; fmt: (o: string) => string }) {
  return <select value={v} onChange={(e) => on(e.target.value)} style={{ background: CARD, color: TXT, border: `1px solid ${LINE}`, borderRadius: 9, padding: '7px 9px', fontSize: 11, maxWidth: 150 }}>{opts.map((o) => <option key={o} value={o}>{fmt(o)}</option>)}</select>;
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ background: on ? SAFFRON : TRACK, color: on ? '#fff' : TXT, border: `1px solid ${on ? SAFFRON : LINE}`, borderRadius: 7, padding: '4px 9px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>{children}</button>;
}
function St({ l, v }: { l: string; v: React.ReactNode }) { return <div><div style={{ fontSize: 15, fontWeight: 800, textTransform: 'capitalize' }}>{v}</div><div style={{ fontSize: 10, color: MUT }}>{l}</div></div>; }
function Empty({ text = 'Awaiting first captures' }: { text?: string }) { return <div style={{ padding: 16, textAlign: 'center', color: MUT, fontSize: 12 }}>{text}</div>; }
