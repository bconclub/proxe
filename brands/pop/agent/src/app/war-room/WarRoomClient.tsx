'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CONSTITUENCIES, DISTRICTS, TOTAL_SEATS } from '@/lib/war-room/constituencies';
import PunjabMap, { type ColorMode } from './PunjabMap';

// ── palette ──
const SAFFRON = '#F06C18', GREEN = '#4EB457', BLUE = '#6EA5D4';
const BG = '#06182E', CARD = '#0C2543', LINE = 'rgba(234,241,251,0.10)', TXT = '#EAF1FB', MUT = 'rgba(234,241,251,0.60)';
const CHANNELS = ['whatsapp', 'voice', 'pulse_app', 'qr', 'missed_call'];
const LEANS = ['supporter', 'leaning', 'undecided', 'opposed'];
const LEAN_COLOR: Record<string, string> = { supporter: GREEN, leaning: '#9BD3A4', undecided: '#F0B429', opposed: SAFFRON };

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
}
interface Filters { constituency: string; district: string; channel: string; language: string; days: string; }
const EMPTY: Filters = { constituency: '', district: '', channel: '', language: '', days: 'all' };

function maskName(name: string | null, c: string | null): string {
  if (name && name.trim().length > 1) { const f = name.trim().split(/\s+/)[0]; return f.length > 2 ? f[0] + '••••' : f; }
  return `Constituent, ${c || 'Punjab'}`;
}
function ago(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`;
}

export default function WarRoomClient() {
  const [data, setData] = useState<WarRoomData | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [mode, setMode] = useState<ColorMode>('heat');
  const [selected, setSelected] = useState<string | null>(null);
  const [pulse, setPulse] = useState<string | null>(null);
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);

  const fetchData = useCallback(async () => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && v !== 'all' && qs.set(k, v));
    try { const r = await fetch(`/api/war-room/data?${qs}`, { cache: 'no-store' }); if (r.ok) setData(await r.json()); } catch {}
  }, [filters]);
  useEffect(() => { fetchData(); }, [fetchData]);

  useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const ch = sb.channel('wr-leads').on('postgres_changes', { event: '*', schema: 'public', table: 'all_leads' }, (p: any) => {
      const seat = p.new?.constituency || p.old?.constituency; if (seat) { setPulse(seat); setTimeout(() => setPulse(null), 2500); }
      fetchData();
    }).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [fetchData]);

  const empty = !data || data.kpis.total === 0;
  const drawer = useMemo(() => (selected ? data?.byConstituency.find((c) => c.constituency === selected) : null), [selected, data]);
  const active = filters.constituency || filters.district || filters.channel || filters.language || filters.days !== 'all';

  return (
    <div style={{ height: '100vh', maxHeight: '100vh', overflow: 'hidden', background: BG, color: TXT, fontFamily: 'Inter, system-ui, sans-serif', display: 'flex', flexDirection: 'column', fontSize: 13 }}>
      {/* HEADER */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 16px', borderBottom: `1px solid ${LINE}`, flexWrap: 'wrap' }}>
        <span style={{ width: 8, height: 8, borderRadius: 99, background: GREEN, animation: 'wr-pulse 2s infinite' }} />
        <strong style={{ fontSize: 15, letterSpacing: '-0.02em' }}>Pulse of Punjab</strong>
        <span style={{ fontSize: 11, color: MUT }}>War Room · Sab di sunenge</span>
        <div style={{ flex: 1 }} />
        <Sel v={filters.district} on={(v) => setFilters({ ...filters, district: v })} opts={['', ...DISTRICTS]} fmt={(o) => o || 'All districts'} />
        <Sel v={filters.constituency} on={(v) => setFilters({ ...filters, constituency: v })} opts={['', ...CONSTITUENCIES.map((c) => c.name)]} fmt={(o) => o || 'All seats'} />
        <Sel v={filters.channel} on={(v) => setFilters({ ...filters, channel: v })} opts={['', ...CHANNELS]} fmt={(o) => o || 'All channels'} />
        <Sel v={filters.language} on={(v) => setFilters({ ...filters, language: v })} opts={['', 'pa', 'hi', 'en']} fmt={(o) => (o ? o.toUpperCase() : 'All langs')} />
        <Sel v={filters.days} on={(v) => setFilters({ ...filters, days: v })} opts={['all', '1', '7', '30']} fmt={(o) => (o === 'all' ? 'All time' : o === '1' ? 'Today' : `${o}d`)} />
        {active && <button onClick={() => setFilters(EMPTY)} style={chip(false)}>Clear</button>}
      </div>

      {/* KPI STRIP */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, padding: '8px 16px' }}>
        <Kpi label="Voices captured" value={data?.kpis.total ?? 0} accent={SAFFRON} sub="total constituents" />
        <Kpi label="Captured today" value={data?.kpis.today ?? 0} accent={GREEN} sub="since midnight" />
        <Kpi label="Active seats" value={data?.kpis.activeConstituencies ?? 0} accent={BLUE} sub={`of ${TOTAL_SEATS}`} />
        <Kpi label="Loop health" value={`${data?.kpis.loopHealthPct ?? 0}%`} accent={GREEN} sub={`${data?.kpis.resolved ?? 0}/${data?.kpis.raised ?? 0} resolved`} />
      </div>

      {/* MAIN — fills remaining height; columns scroll internally */}
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(0,1.25fr) minmax(0,1fr) 240px', gap: 8, padding: '0 16px 12px' }}>
        {/* MAP */}
        <div style={{ ...panel, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 10px', borderBottom: `1px solid ${LINE}`, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 12 }}>Constituency map</strong>
            <div style={{ flex: 1 }} />
            {(['heat', 'lean', 'issue', 'turnout'] as ColorMode[]).map((m) => (
              <button key={m} onClick={() => setMode(m)} style={chip(mode === m)}>
                {m === 'heat' ? 'Heat' : m === 'lean' ? 'Lean' : m === 'issue' ? 'Issue' : 'Turnout'}
              </button>
            ))}
          </div>
          <div style={{ flex: 1, minHeight: 0, padding: 8 }}>
            <PunjabMap mode={mode} byConstituency={data?.byConstituency || []} pulseSeat={pulse} selected={selected} onSelect={(n) => setSelected(n === selected ? null : n)} />
          </div>
          <Legend mode={mode} />
        </div>

        {/* ANALYTICS (scroll) */}
        <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, minHeight: 0, paddingRight: 2 }}>
          <Box title="Top issues" sub="count × salience · 7d">
            {empty ? <Empty /> : data!.byCategory.map((c) => {
              const max = Math.max(...data!.byCategory.map((x) => x.count), 1);
              return (
                <Row key={c.category} a={<span style={{ textTransform: 'capitalize' }}>{c.category.replace('_', ' ')}</span>}
                  bar={c.count / max} barColor={SAFFRON}
                  b={<>{c.count} {c.trend7d > 0 ? <span style={{ color: SAFFRON }}>▲</span> : c.trend7d < 0 ? <span style={{ color: GREEN }}>▼</span> : ''}</>} />
              );
            })}
          </Box>

          <Box title="Lean + swing" sub="undecided = targets">
            {empty ? <Empty /> : (<>
              <div style={{ display: 'flex', height: 16, borderRadius: 5, overflow: 'hidden', marginBottom: 6 }}>
                {LEANS.map((l) => { const t = LEANS.reduce((s, x) => s + (data!.leanOverall[x] || 0), 0) || 1; return <div key={l} title={`${l} ${data!.leanOverall[l] || 0}`} style={{ width: `${((data!.leanOverall[l] || 0) / t) * 100}%`, background: LEAN_COLOR[l] }} />; })}
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
                {LEANS.map((l) => <span key={l} style={{ fontSize: 10, color: MUT, display: 'flex', alignItems: 'center', gap: 4 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: LEAN_COLOR[l] }} />{l} {data!.leanOverall[l] || 0}</span>)}
              </div>
              {data!.swing.slice(0, 6).map((s) => (
                <Row key={s.constituency} a={s.constituency} bar={s.undecidedPct / 100} barColor="#F0B429" b={`${s.undecidedPct}%`} />
              ))}
            </>)}
          </Box>

          <Box title="Mobilization" sub="who will act">
            {empty ? <Empty /> : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                {(['vote', 'volunteer', 'rally', 'share'] as const).map((k) => (
                  <div key={k} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 6, padding: '8px 4px', textAlign: 'center' }}>
                    <div style={{ fontSize: 18, fontWeight: 800, color: GREEN }}>{data!.mobilization[k] || 0}</div>
                    <div style={{ fontSize: 10, color: MUT, textTransform: 'capitalize' }}>{k}</div>
                  </div>
                ))}
              </div>
            )}
          </Box>

          <Box title="Channel mix" sub="which magnet pulls">
            {empty ? <Empty /> : data!.channelMix.map((c) => (
              <Row key={c.magnet} a={<span style={{ textTransform: 'capitalize' }}>{c.magnet.replace('_', ' ')}</span>} bar={c.share / 100} barColor={BLUE} b={`${c.share}%`} />
            ))}
          </Box>

          <Box title="Issue × geography" sub="district × grievance">
            {empty ? <Empty /> : <Matrix data={data!} />}
          </Box>
        </div>

        {/* LIVE FEED (scroll) */}
        <div style={{ ...panel, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
          <div style={{ padding: '8px 10px', borderBottom: `1px solid ${LINE}` }}>
            <strong style={{ fontSize: 12 }}>Live feed</strong>
            <div style={{ fontSize: 10, color: MUT }}>listening right now</div>
          </div>
          <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
            {(!data || data.liveFeed.length === 0) ? <Empty /> : data.liveFeed.map((f) => (
              <div key={f.id} style={{ padding: '7px 10px', borderBottom: `1px solid ${LINE}`, animation: 'wr-in 0.4s ease' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{maskName(f.name, f.constituency)}</span>
                  <span style={{ fontSize: 10, color: MUT }}>{ago(f.created_at)}</span>
                </div>
                <div style={{ fontSize: 10, color: MUT, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {f.constituency || 'Punjab'} · <span style={{ color: SAFFRON, textTransform: 'capitalize' }}>{(f.category || 'other').replace('_', ' ')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DRAWER */}
      {selected && (
        <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 40 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: 340, maxWidth: '92vw', background: CARD, borderLeft: `1px solid ${LINE}`, padding: 18, overflowY: 'auto', animation: 'wr-slide 0.25s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 17 }}>{selected}</strong>
              <button onClick={() => setSelected(null)} style={chip(false)}>✕</button>
            </div>
            <div style={{ color: MUT, fontSize: 11, marginBottom: 10 }}>{CONSTITUENCIES.find((c) => c.name === selected)?.district} · {CONSTITUENCIES.find((c) => c.name === selected)?.region}</div>
            {drawer ? (<>
              <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
                <St label="Voices" v={drawer.count} /><St label="Top issue" v={(drawer.topCategory || '—').replace('_', ' ')} /><St label="Vote intent" v={`${Math.round(drawer.voteShare)}%`} />
              </div>
              <div style={{ fontSize: 10, color: MUT, marginBottom: 4 }}>LATEST GRIEVANCES</div>
              {(data?.liveFeed || []).filter((f) => f.constituency === selected).slice(0, 6).map((f) => (
                <div key={f.id} style={{ padding: '6px 0', borderBottom: `1px solid ${LINE}`, fontSize: 12 }}>
                  <span style={{ color: SAFFRON, textTransform: 'capitalize' }}>{(f.category || 'other').replace('_', ' ')}</span> <span style={{ color: MUT }}>· {ago(f.created_at)}</span>
                </div>
              ))}
              {(data?.liveFeed || []).filter((f) => f.constituency === selected).length === 0 && <Empty text="No recent grievances" />}
            </>) : <Empty text="No captures here yet" />}
          </div>
        </div>
      )}

      <style>{`
        @keyframes wr-pulse{0%{box-shadow:0 0 0 0 rgba(78,180,87,0.7)}70%{box-shadow:0 0 0 7px rgba(78,180,87,0)}100%{box-shadow:0 0 0 0 rgba(78,180,87,0)}}
        @keyframes wr-in{from{opacity:0;transform:translateY(-5px)}to{opacity:1;transform:none}}
        @keyframes wr-slide{from{transform:translateX(18px);opacity:0.4}to{transform:none;opacity:1}}
        ::-webkit-scrollbar{width:7px;height:7px}::-webkit-scrollbar-thumb{background:rgba(234,241,251,0.15);border-radius:9px}
      `}</style>
    </div>
  );
}

// ── primitives ──
const panel: React.CSSProperties = { background: CARD, border: `1px solid ${LINE}`, borderRadius: 10 };
function Box({ title, sub, children }: { title: string; sub?: string; children: React.ReactNode }) {
  return (
    <div style={panel}>
      <div style={{ padding: '7px 10px', borderBottom: `1px solid ${LINE}` }}>
        <strong style={{ fontSize: 12 }}>{title}</strong>{sub && <span style={{ fontSize: 10, color: MUT, marginLeft: 6 }}>{sub}</span>}
      </div>
      <div style={{ padding: 10, display: 'flex', flexDirection: 'column', gap: 5 }}>{children}</div>
    </div>
  );
}
function Row({ a, b, bar, barColor }: { a: React.ReactNode; b: React.ReactNode; bar: number; barColor: string }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '96px 1fr 42px', alignItems: 'center', gap: 6 }}>
      <span style={{ fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a}</span>
      <div style={{ height: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 3, overflow: 'hidden' }}><div style={{ width: `${Math.max(0, Math.min(1, bar)) * 100}%`, height: '100%', background: barColor, borderRadius: 3 }} /></div>
      <span style={{ fontSize: 11, color: MUT, textAlign: 'right' }}>{b}</span>
    </div>
  );
}
function Kpi({ label, value, sub, accent }: { label: string; value: number | string; sub: string; accent: string }) {
  return (
    <div style={{ ...panel, padding: '8px 12px' }}>
      <div style={{ fontSize: 10, color: MUT }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: accent, lineHeight: 1.1 }}>{value}</div>
      <div style={{ fontSize: 10, color: MUT }}>{sub}</div>
    </div>
  );
}
function Sel({ v, on, opts, fmt }: { v: string; on: (v: string) => void; opts: string[]; fmt: (o: string) => string }) {
  return <select value={v} onChange={(e) => on(e.target.value)} style={{ background: CARD, color: TXT, border: `1px solid ${LINE}`, borderRadius: 7, padding: '4px 6px', fontSize: 11, maxWidth: 130 }}>{opts.map((o) => <option key={o} value={o}>{fmt(o)}</option>)}</select>;
}
function St({ label, v }: { label: string; v: React.ReactNode }) { return <div><div style={{ fontSize: 16, fontWeight: 800, textTransform: 'capitalize' }}>{v}</div><div style={{ fontSize: 10, color: MUT }}>{label}</div></div>; }
function Empty({ text = 'Awaiting first captures' }: { text?: string }) { return <div style={{ padding: 14, textAlign: 'center', color: MUT, fontSize: 12 }}>{text}</div>; }
function Legend({ mode }: { mode: ColorMode }) {
  const ISSUE: Record<string, string> = { jobs: '#6EA5D4', water: '#2EC4B6', power: '#F0B429', roads: '#9B8CFF', drugs: '#FF5D73', farm_debt: '#4EB457', health: '#F06C18', education: '#C77DFF', other: '#7A8AA0' };
  return (
    <div style={{ padding: '6px 10px', borderTop: `1px solid ${LINE}`, fontSize: 10, color: MUT, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
      {mode === 'issue' ? Object.entries(ISSUE).map(([k, v]) => <span key={k} style={{ display: 'flex', alignItems: 'center', gap: 3, textTransform: 'capitalize' }}><span style={{ width: 8, height: 8, borderRadius: 2, background: v }} />{k.replace('_', ' ')}</span>)
        : <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{mode === 'lean' ? 'Opposed' : 'Low'}<span style={{ width: 80, height: 8, borderRadius: 4, background: mode === 'lean' ? 'linear-gradient(90deg,#F06C18,#7A8AA0,#4EB457)' : mode === 'turnout' ? 'linear-gradient(90deg,#0C2543,#6EA5D4)' : 'linear-gradient(90deg,#0C2543,#F06C18)' }} />{mode === 'lean' ? 'Supporter' : 'High'}</span>}
    </div>
  );
}
function Matrix({ data }: { data: WarRoomData }) {
  const { districts, categories, cells } = data.matrix;
  const max = Math.max(1, ...districts.flatMap((d) => categories.map((c) => cells[d]?.[c] || 0)));
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 10, width: '100%' }}>
        <thead><tr><th style={{ textAlign: 'left', padding: 3, color: MUT, position: 'sticky', left: 0, background: CARD }}>District</th>{categories.map((c) => <th key={c} style={{ padding: 3, color: MUT, fontWeight: 500 }}>{c.slice(0, 4)}</th>)}</tr></thead>
        <tbody>{districts.map((d) => (
          <tr key={d}><td style={{ padding: 3, position: 'sticky', left: 0, background: CARD, whiteSpace: 'nowrap' }}>{d}</td>
            {categories.map((c) => { const v = cells[d]?.[c] || 0; const a = v === 0 ? 0 : 0.15 + 0.85 * (v / max); return <td key={c} style={{ padding: 3, textAlign: 'center', background: `rgba(240,108,24,${a})`, color: a > 0.5 ? '#fff' : MUT }}>{v || ''}</td>; })}
          </tr>
        ))}</tbody>
      </table>
    </div>
  );
}
const chip = (on: boolean): React.CSSProperties => ({ background: on ? SAFFRON : 'rgba(255,255,255,0.06)', color: on ? '#fff' : TXT, border: `1px solid ${on ? SAFFRON : LINE}`, borderRadius: 99, padding: '4px 9px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap' });
