'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CONSTITUENCIES, DISTRICTS, TOTAL_SEATS } from '@/lib/war-room/constituencies';
import PunjabMap, { type ColorMode } from './PunjabMap';
import { Sparkline, DonutChart, RadialProgress } from '@/components/dashboard/MicroCharts';
import { LineChart, Line, AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from 'recharts';
import {
  MdGridView, MdMap, MdReportProblem, MdInsights, MdGroups, MdHub, MdDescription, MdNotificationsActive, MdSettings,
  MdWaterDrop, MdBolt, MdWork, MdAddRoad, MdLocalHospital, MdSchool, MdAgriculture, MdWarning, MdMoreHoriz, MdOpenInFull,
} from 'react-icons/md';

// ── palette ──
const SAFFRON = '#F06C18', GREEN = '#22C55E', BLUE = '#3B82F6', AMBER = '#F59E0B', PURPLE = '#A78BFA';
const BG = '#0A1A2F', CARD = '#0E2238', LINE = 'rgba(234,241,251,0.08)', TXT = '#EAF1FB', MUT = 'rgba(234,241,251,0.55)';
const CHANNELS = ['whatsapp', 'voice', 'pulse_app', 'qr', 'missed_call'];
const LEAN_KEYS = ['supporter', 'leaning', 'undecided', 'opposed'];
const LEAN_C: Record<string, string> = { supporter: GREEN, leaning: '#86EFAC', undecided: AMBER, opposed: SAFFRON };
const CAT_ICON: Record<string, any> = { water: MdWaterDrop, power: MdBolt, jobs: MdWork, roads: MdAddRoad, health: MdLocalHospital, education: MdSchool, farm_debt: MdAgriculture, drugs: MdWarning, other: MdMoreHoriz };
const CAT_C: Record<string, string> = { water: '#2EC4B6', power: AMBER, jobs: BLUE, roads: PURPLE, health: '#FB7185', education: '#C77DFF', farm_debt: GREEN, drugs: '#FF5D73', other: '#7A8AA0' };

export interface WarRoomData {
  kpis: { total: number; today: number; activeConstituencies: number; raised: number; resolved: number; loopHealthPct: number };
  byCategory: { category: string; count: number; salienceWeighted: number; trend7d: number }[];
  leanOverall: Record<string, number>;
  swing: { constituency: string; total: number; undecided: number; undecidedPct: number }[];
  byConstituency: { constituency: string; count: number; topCategory: string | null; leanScore: number; voteShare: number }[];
  matrix: { districts: string[]; categories: string[]; cells: Record<string, Record<string, number>> };
  mobilization: Record<string, number>;
  channelMix: { magnet: string; count: number; share: number }[];
  liveFeed: { id: string; name: string | null; constituency: string | null; category: string | null; created_at: string }[];
  series: { days: string[]; total: number[]; resolved: number[]; categories: string[]; byCategory: Record<string, number[]>; seats: string[]; bySeat: Record<string, number[]>; mobilization: Record<string, number[]> };
  sentiment: { net: number; shiftPp: number; label: string };
}
interface Filters { constituency: string; district: string; channel: string; language: string; days: string; }
const EMPTY: Filters = { constituency: '', district: '', channel: '', language: '', days: 'all' };

const sp = (a: number[] = []) => a.map((v) => ({ value: v }));
function mask(name: string | null, c: string | null) { if (name && name.trim().length > 1) { const f = name.trim().split(/\s+/)[0]; return f.length > 2 ? f[0] + '••••' : f; } return `Constituent, ${c || 'Punjab'}`; }
function ago(iso: string) { const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; }
const NAV = [
  { id: 'overview', icon: MdGridView, label: 'Overview' }, { id: 'map', icon: MdMap, label: 'Map' },
  { id: 'issues', icon: MdReportProblem, label: 'Issues' }, { id: 'signals', icon: MdInsights, label: 'Signals' },
  { id: 'mobilization', icon: MdGroups, label: 'Mobilization' }, { id: 'channels', icon: MdHub, label: 'Channels' },
  { id: 'reports', icon: MdDescription, label: 'Reports' }, { id: 'alerts', icon: MdNotificationsActive, label: 'Alerts' },
  { id: 'settings', icon: MdSettings, label: 'Settings' },
];

export default function WarRoomClient() {
  const [data, setData] = useState<WarRoomData | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [mode, setMode] = useState<ColorMode>('heat');
  const [selected, setSelected] = useState<string | null>(null);
  const [pulse, setPulse] = useState<string | null>(null);
  const [nav, setNav] = useState('overview');
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
  const lineData = useMemo(() => (d ? d.series.days.map((day, i) => { const o: any = { day: day.slice(5) }; d.series.seats.forEach((s) => (o[s] = d.series.bySeat[s]?.[i] || 0)); return o; }) : []), [d]);
  const areaData = useMemo(() => (d ? d.series.days.map((day, i) => { const o: any = { day: day.slice(5) }; d.series.categories.forEach((c) => (o[c] = d.series.byCategory[c]?.[i] || 0)); return o; }) : []), [d]);
  const SEAT_C = [SAFFRON, BLUE, GREEN, AMBER, PURPLE, '#2EC4B6'];

  return (
    <div style={{ height: '100vh', overflow: 'hidden', background: BG, color: TXT, display: 'flex', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12 }}>
      {/* NAV RAIL */}
      <div style={{ width: 76, flexShrink: 0, background: '#081320', borderRight: `1px solid ${LINE}`, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 4 }}>
        <div style={{ width: 38, height: 38, borderRadius: 10, background: SAFFRON, display: 'grid', placeItems: 'center', marginBottom: 14 }}>
          <MdMap size={20} color="#fff" />
        </div>
        {NAV.map((n) => {
          const on = nav === n.id; const Icon = n.icon;
          return (
            <button key={n.id} onClick={() => setNav(n.id)} title={n.label}
              style={{ width: 60, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer', background: on ? 'rgba(240,108,24,0.14)' : 'transparent', color: on ? SAFFRON : MUT, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3 }}>
              <Icon size={18} /><span style={{ fontSize: 9 }}>{n.label}</span>
            </button>
          );
        })}
      </div>

      {/* MAIN */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column' }}>
        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 18px', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: '-0.02em' }}>Pulse of Punjab <span style={{ color: MUT, fontWeight: 500, fontSize: 15 }}>War Room</span></div>
            <div style={{ fontSize: 11, color: MUT, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 9, background: GREEN, animation: 'wr-pulse 2s infinite' }} />Real-time political intelligence across Punjab</div>
          </div>
          <div style={{ flex: 1 }} />
          <Sel v={filters.district} on={(v) => setFilters({ ...filters, district: v })} opts={['', ...DISTRICTS]} fmt={(o) => o || 'All Districts'} />
          <Sel v={filters.constituency} on={(v) => setFilters({ ...filters, constituency: v })} opts={['', ...CONSTITUENCIES.map((c) => c.name)]} fmt={(o) => o || 'All Seats'} />
          <Sel v={filters.channel} on={(v) => setFilters({ ...filters, channel: v })} opts={['', ...CHANNELS]} fmt={(o) => o ? o.replace('_', ' ') : 'All Channels'} />
          <Sel v={filters.language} on={(v) => setFilters({ ...filters, language: v })} opts={['', 'pa', 'hi', 'en']} fmt={(o) => o ? o.toUpperCase() : 'All Languages'} />
          <Sel v={filters.days} on={(v) => setFilters({ ...filters, days: v })} opts={['all', '1', '7', '30']} fmt={(o) => o === 'all' ? 'All Time' : o === '1' ? 'Today' : `${o}d`} />
        </div>

        {/* SCROLL BODY (everything inside one VH) */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '0 18px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* KPI ROW */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 12 }}>
            <Kpi label="Voices Captured" value={d?.kpis.total ?? 0} sub="Total constituents" trend="+14%" up accent={SAFFRON} spark={d?.series.total} />
            <Kpi label="Captured Today" value={d?.kpis.today ?? 0} sub="Since midnight" trend="+12%" up accent={GREEN} spark={d?.series.total?.slice(-7)} />
            <Kpi label="Active Seats" value={d?.kpis.activeConstituencies ?? 0} sub={`of ${TOTAL_SEATS}`} trend="+5" up accent={BLUE} spark={d?.series.total} />
            <Kpi label="Loop Health" value={`${d?.kpis.loopHealthPct ?? 0}%`} sub={`${d?.kpis.resolved ?? 0} / ${d?.kpis.raised ?? 0} resolved`} trend="+3pp" up accent={GREEN} spark={d?.series.resolved} />
            <Kpi label="Sentiment Shift" value={`${(d?.sentiment.shiftPp ?? 0) >= 0 ? '+' : ''}${d?.sentiment.shiftPp ?? 0}pp`} sub="vs 7d ago" trend={d?.sentiment.label || '—'} up={(d?.sentiment.shiftPp ?? 0) >= 0} accent={PURPLE} spark={d?.series.total} />
          </div>

          {/* MAIN GRID: map | center | feed */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) minmax(0,1.15fr) 270px', gap: 12, minHeight: 430 }}>
            {/* MAP */}
            <Panel title="Constituency Heat Map" sub="Intensity by volume and salience" right={
              <div style={{ display: 'flex', gap: 5 }}>{(['heat', 'lean', 'issue', 'turnout'] as ColorMode[]).map((m) => <Chip key={m} on={mode === m} onClick={() => setMode(m)}>{m === 'heat' ? 'Heat' : m === 'lean' ? 'Lean' : m === 'issue' ? 'Issue' : 'Turnout'}</Chip>)}</div>
            }>
              <div style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', gap: 8 }}>
                <div style={{ width: 14, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: MUT }}>
                  <span>High</span>
                  <div style={{ flex: 1, width: 8, borderRadius: 5, margin: '6px 0', background: `linear-gradient(to top, #0E2238, ${SAFFRON})` }} />
                  <span>Low</span>
                </div>
                <div style={{ flex: 1, minHeight: 0 }}>
                  <PunjabMap mode={mode} byConstituency={d?.byConstituency || []} pulseSeat={pulse} selected={selected} onSelect={(n) => setSelected(n === selected ? null : n)} />
                </div>
              </div>
            </Panel>

            {/* CENTER COLUMN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
              <Panel title="Top Issues by Salience" grow>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5, overflowY: 'auto' }}>
                  {(d?.byCategory || []).map((c, i) => {
                    const max = Math.max(...(d?.byCategory || []).map((x) => x.count), 1); const Icon = CAT_ICON[c.category] || MdMoreHoriz; const pct = Math.round((c.count / (d?.kpis.total || 1)) * 100);
                    return (
                      <div key={c.category} style={{ display: 'grid', gridTemplateColumns: '14px 110px 1fr 34px', alignItems: 'center', gap: 8 }}>
                        <span style={{ color: MUT, fontSize: 11 }}>{i + 1}</span>
                        <span style={{ display: 'flex', alignItems: 'center', gap: 6, textTransform: 'capitalize' }}><Icon size={13} color={CAT_C[c.category]} />{c.category.replace('_', ' ')}</span>
                        <div style={{ height: 10, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${(c.count / max) * 100}%`, height: '100%', background: SAFFRON, borderRadius: 3 }} /></div>
                        <span style={{ textAlign: 'right', color: MUT }}>{pct}%</span>
                      </div>
                    );
                  })}
                </div>
              </Panel>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Panel title="Support / Lean / Opposed">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <div style={{ width: 96, height: 96, flexShrink: 0 }}>
                      <DonutChart data={LEAN_KEYS.map((k) => ({ name: k, value: d?.leanOverall[k] || 0 }))} colors={LEAN_KEYS.map((k) => LEAN_C[k])} />
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {LEAN_KEYS.map((k) => { const t = LEAN_KEYS.reduce((s, x) => s + (d?.leanOverall[x] || 0), 0) || 1; return <span key={k} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: LEAN_C[k] }} /><span style={{ textTransform: 'capitalize', color: MUT, width: 64 }}>{k}</span><b>{d?.leanOverall[k] || 0}</b> <span style={{ color: MUT }}>({Math.round(((d?.leanOverall[k] || 0) / t) * 100)}%)</span></span>; })}
                    </div>
                  </div>
                </Panel>
                <Panel title="Sentiment">
                  <div style={{ display: 'grid', placeItems: 'center' }}>
                    <RadialProgress value={Math.round(((d?.sentiment.net ?? 0) + 1) / 2 * 100)} max={100} size={104} color={(d?.sentiment.net ?? 0) >= 0 ? GREEN : SAFFRON} label="Net Sentiment" valueFormatter={() => `${(d?.sentiment.net ?? 0) >= 0 ? '+' : ''}${d?.sentiment.net ?? 0}`} />
                    <div style={{ fontSize: 11, color: (d?.sentiment.net ?? 0) >= 0 ? GREEN : SAFFRON }}>{d?.sentiment.label}</div>
                  </div>
                </Panel>
              </div>
              <Panel title="District Comparison (Top 6)" grow>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={lineData} margin={{ top: 4, right: 6, bottom: 0, left: -22 }}>
                    <XAxis dataKey="day" tick={{ fill: MUT, fontSize: 9 }} axisLine={false} tickLine={false} interval={2} />
                    <Tooltip contentStyle={{ background: '#081320', border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 11 }} />
                    {(d?.series.seats || []).map((s, i) => <Line key={s} type="monotone" dataKey={s} stroke={SEAT_C[i % SEAT_C.length]} strokeWidth={1.6} dot={false} />)}
                  </LineChart>
                </ResponsiveContainer>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', fontSize: 9, color: MUT, marginTop: 2 }}>
                  {(d?.series.seats || []).map((s, i) => <span key={s} style={{ display: 'flex', alignItems: 'center', gap: 3 }}><span style={{ width: 7, height: 7, borderRadius: 9, background: SEAT_C[i % SEAT_C.length] }} />{s}</span>)}
                </div>
              </Panel>
            </div>

            {/* LIVE FEED */}
            <Panel title="Live Feed" sub="Listening now" noPad>
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

          {/* BOTTOM ROW */}
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,0.9fr) minmax(0,1fr) minmax(0,1.1fr) minmax(0,1.1fr)', gap: 12, minHeight: 200 }}>
            <Panel title="Channel Mix" sub="By volume">
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ width: 92, height: 92, flexShrink: 0 }}><DonutChart data={(d?.channelMix || []).map((c) => ({ name: c.magnet, value: c.count }))} colors={[GREEN, BLUE, SAFFRON, AMBER, PURPLE]} /></div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                  {(d?.channelMix || []).map((c, i) => <span key={c.magnet} style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 5 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: [GREEN, BLUE, SAFFRON, AMBER, PURPLE][i % 5] }} /><span style={{ textTransform: 'capitalize', color: MUT, width: 70 }}>{c.magnet.replace('_', ' ')}</span><b>{c.share}%</b></span>)}
                </div>
              </div>
            </Panel>
            <Panel title="Mobilization Readiness" sub="Who will act">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8 }}>
                {(['vote', 'volunteer', 'rally', 'share'] as const).map((k) => (
                  <div key={k} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 8, padding: 8 }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: GREEN }}>{d?.mobilization[k] || 0}</div>
                    <div style={{ fontSize: 10, color: MUT, textTransform: 'capitalize', marginBottom: 2 }}>{k === 'vote' ? 'Voters' : k === 'volunteer' ? 'Volunteers' : k === 'rally' ? 'Rallies' : 'Shares'}</div>
                    <div style={{ height: 22 }}><Sparkline data={sp(d?.series.mobilization[k])} color={GREEN} height={22} /></div>
                  </div>
                ))}
              </div>
            </Panel>
            <Panel title="Issue Trend (Top 5)" sub="14 days">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={areaData} margin={{ top: 4, right: 4, bottom: 0, left: -24 }}>
                  <XAxis dataKey="day" tick={{ fill: MUT, fontSize: 9 }} axisLine={false} tickLine={false} interval={3} />
                  <Tooltip contentStyle={{ background: '#081320', border: `1px solid ${LINE}`, borderRadius: 8, fontSize: 11 }} />
                  {(d?.series.categories || []).map((c) => <Area key={c} type="monotone" dataKey={c} stackId="1" stroke={CAT_C[c]} fill={CAT_C[c]} fillOpacity={0.55} />)}
                </AreaChart>
              </ResponsiveContainer>
            </Panel>
            <Panel title="Constituency Snapshot" sub="Top 5 by volume & salience">
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

      {/* DRAWER */}
      {selected && (
        <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: 340, maxWidth: '92vw', background: CARD, borderLeft: `1px solid ${LINE}`, padding: 18, overflowY: 'auto' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}><b style={{ fontSize: 17 }}>{selected}</b><Chip on={false} onClick={() => setSelected(null)}>✕</Chip></div>
            <div style={{ color: MUT, fontSize: 11, marginBottom: 10 }}>{CONSTITUENCIES.find((c) => c.name === selected)?.district} · {CONSTITUENCIES.find((c) => c.name === selected)?.region}</div>
            {(() => { const seat = d?.byConstituency.find((b) => b.constituency === selected); return seat ? (<>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}><St l="Voices" v={seat.count} /><St l="Top issue" v={(seat.topCategory || '—').replace('_', ' ')} /><St l="Vote intent" v={`${Math.round(seat.voteShare)}%`} /></div>
              <div style={{ fontSize: 10, color: MUT, marginBottom: 4 }}>LATEST GRIEVANCES</div>
              {(d?.liveFeed || []).filter((f) => f.constituency === selected).slice(0, 6).map((f) => <div key={f.id} style={{ padding: '6px 0', borderBottom: `1px solid ${LINE}`, fontSize: 12 }}><span style={{ color: SAFFRON, textTransform: 'capitalize' }}>{(f.category || 'other').replace('_', ' ')}</span> <span style={{ color: MUT }}>· {ago(f.created_at)}</span></div>)}
            </>) : <Empty text="No captures here yet" />; })()}
          </div>
        </div>
      )}

      <style>{`@keyframes wr-pulse{0%{box-shadow:0 0 0 0 rgba(34,197,94,0.7)}70%{box-shadow:0 0 0 6px rgba(34,197,94,0)}100%{box-shadow:0 0 0 0 rgba(34,197,94,0)}}@keyframes wr-in{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}::-webkit-scrollbar{width:6px;height:6px}::-webkit-scrollbar-thumb{background:rgba(234,241,251,0.14);border-radius:9px}`}</style>
    </div>
  );
}

// ── primitives ──
const card: React.CSSProperties = { background: CARD, border: `1px solid ${LINE}`, borderRadius: 12 };
function Panel({ title, sub, right, children, noPad, grow }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; noPad?: boolean; grow?: boolean }) {
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', minHeight: 0, ...(grow ? { flex: 1 } : {}) }}>
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
      <div style={{ height: 26, marginTop: 4, opacity: 0.8 }}><Sparkline data={sp(spark)} color={accent} height={26} showGradient /></div>
    </div>
  );
}
function Sel({ v, on, opts, fmt }: { v: string; on: (v: string) => void; opts: string[]; fmt: (o: string) => string }) {
  return <select value={v} onChange={(e) => on(e.target.value)} style={{ background: CARD, color: TXT, border: `1px solid ${LINE}`, borderRadius: 9, padding: '7px 9px', fontSize: 11, maxWidth: 150 }}>{opts.map((o) => <option key={o} value={o}>{fmt(o)}</option>)}</select>;
}
function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button onClick={onClick} style={{ background: on ? SAFFRON : 'rgba(255,255,255,0.05)', color: on ? '#fff' : TXT, border: `1px solid ${on ? SAFFRON : LINE}`, borderRadius: 7, padding: '4px 9px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' }}>{children}</button>;
}
function St({ l, v }: { l: string; v: React.ReactNode }) { return <div><div style={{ fontSize: 15, fontWeight: 800, textTransform: 'capitalize' }}>{v}</div><div style={{ fontSize: 10, color: MUT }}>{l}</div></div>; }
function Empty({ text = 'Awaiting first captures' }: { text?: string }) { return <div style={{ padding: 16, textAlign: 'center', color: MUT, fontSize: 12 }}>{text}</div>; }
