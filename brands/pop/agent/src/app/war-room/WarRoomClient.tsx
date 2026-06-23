'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { CONSTITUENCIES, DISTRICTS, TOTAL_SEATS } from '@/lib/war-room/constituencies';
import ConstituencyTileMap, { type ColorMode } from './ConstituencyTileMap';

// ── Brand palette (deep blue + saffron + white + tricolor green) ───────────
const BLUE = '#003C90';
const SAFFRON = '#F06C18';
const GREEN = '#4EB457';
const BG = '#06182E';
const CARD = '#0C2543';
const LINE = 'rgba(234,241,251,0.10)';
const TXT = '#EAF1FB';
const MUT = 'rgba(234,241,251,0.62)';

const CATEGORIES = ['jobs', 'water', 'power', 'roads', 'drugs', 'farm_debt', 'health', 'education', 'other'] as const;
const CHANNELS = ['whatsapp', 'voice', 'pulse_app', 'qr', 'missed_call'] as const;
const LEANS = ['supporter', 'leaning', 'undecided', 'opposed'] as const;
const LEAN_COLOR: Record<string, string> = { supporter: GREEN, leaning: '#9BD3A4', undecided: '#F0B429', opposed: SAFFRON };

// ── Data contract (filled by /api/war-room/data) ───────────────────────────
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

interface Filters {
  constituency: string;
  district: string;
  channel: string;
  language: string;
  days: string; // '1' | '7' | '30' | 'all'
}
const EMPTY_FILTERS: Filters = { constituency: '', district: '', channel: '', language: '', days: 'all' };

function maskName(name: string | null, constituency: string | null): string {
  if (name && name.trim() && name.trim().length > 1) {
    const first = name.trim().split(/\s+/)[0];
    return first.length > 2 ? first[0] + '•'.repeat(Math.min(4, first.length - 1)) : first;
  }
  return `Constituent, ${constituency || 'Punjab'}`;
}
function timeAgo(iso: string): string {
  const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function WarRoomClient() {
  const [data, setData] = useState<WarRoomData | null>(null);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [colorMode, setColorMode] = useState<ColorMode>('heat');
  const [selected, setSelected] = useState<string | null>(null);
  const [pulseSeat, setPulseSeat] = useState<string | null>(null);
  const supabaseRef = useRef<ReturnType<typeof createClient> | null>(null);

  const fetchData = useCallback(async () => {
    const qs = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && qs.set(k, v));
    try {
      const r = await fetch(`/api/war-room/data?${qs.toString()}`, { cache: 'no-store' });
      if (r.ok) setData(await r.json());
    } catch {
      /* keep last data; panels show empty states */
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Realtime: a new capture pulses the seat + refreshes aggregates.
  useEffect(() => {
    if (!supabaseRef.current) supabaseRef.current = createClient();
    const sb = supabaseRef.current;
    const ch = sb
      .channel('war-room-leads')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'all_leads' }, (payload: any) => {
        const seat = (payload.new?.constituency || payload.old?.constituency) as string | undefined;
        if (seat) { setPulseSeat(seat); setTimeout(() => setPulseSeat(null), 2500); }
        fetchData();
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [fetchData]);

  const empty = !data || data.kpis.total === 0;
  const drawer = useMemo(
    () => (selected ? data?.byConstituency.find((c) => c.constituency === selected) : null),
    [selected, data],
  );

  return (
    <div style={{ minHeight: '100vh', background: BG, color: TXT, fontFamily: 'Inter, system-ui, sans-serif' }}>
      {/* ── TITLE + FILTERS ─────────────────────────────────────────────── */}
      <div style={{ position: 'sticky', top: 0, zIndex: 20, background: 'rgba(6,24,46,0.92)', backdropFilter: 'blur(8px)', borderBottom: `1px solid ${LINE}`, padding: '12px 20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ width: 9, height: 9, borderRadius: 99, background: GREEN, boxShadow: `0 0 0 0 ${GREEN}`, animation: 'wr-pulse 2s infinite' }} />
            <h1 style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.02em', margin: 0 }}>Pulse of Punjab — War Room</h1>
            <span style={{ fontSize: 12, color: MUT }}>Sab di sunenge · live</span>
          </div>
          <div style={{ flex: 1 }} />
          <Filter label="Region/District" value={filters.district} onChange={(v) => setFilters({ ...filters, district: v })} options={['', ...DISTRICTS]} fmt={(o) => o || 'All districts'} />
          <Filter label="Constituency" value={filters.constituency} onChange={(v) => setFilters({ ...filters, constituency: v })} options={['', ...CONSTITUENCIES.map((c) => c.name)]} fmt={(o) => o || 'All seats'} />
          <Filter label="Channel" value={filters.channel} onChange={(v) => setFilters({ ...filters, channel: v })} options={['', ...CHANNELS]} fmt={(o) => o || 'All channels'} />
          <Filter label="Language" value={filters.language} onChange={(v) => setFilters({ ...filters, language: v })} options={['', 'pa', 'hi', 'en']} fmt={(o) => (o ? o.toUpperCase() : 'All languages')} />
          <Filter label="Window" value={filters.days} onChange={(v) => setFilters({ ...filters, days: v })} options={['all', '1', '7', '30']} fmt={(o) => (o === 'all' ? 'All time' : o === '1' ? 'Today' : `${o}d`)} />
          {(filters.constituency || filters.district || filters.channel || filters.language || filters.days !== 'all') && (
            <button onClick={() => setFilters(EMPTY_FILTERS)} style={chip(false)}>Clear</button>
          )}
        </div>
      </div>

      {/* ── KPI STRIP ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12, padding: '16px 20px' }}>
        <Kpi label="Voices captured" value={data?.kpis.total ?? 0} accent={SAFFRON} sub={loading ? 'loading…' : 'total constituents'} />
        <Kpi label="Captured today" value={data?.kpis.today ?? 0} accent={GREEN} sub="since midnight" />
        <Kpi label="Active constituencies" value={data?.kpis.activeConstituencies ?? 0} accent={'#6EA5D4'} sub={`of ${TOTAL_SEATS} seats`} />
        <Kpi label="Loop health" value={`${data?.kpis.loopHealthPct ?? 0}%`} accent={GREEN} sub={`${data?.kpis.resolved ?? 0}/${data?.kpis.raised ?? 0} resolved`} />
      </div>

      {/* ── MAIN GRID ──────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 320px', gap: 16, padding: '0 20px 28px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16, minWidth: 0 }}>
          {/* MAP */}
          <Panel title="Constituency map" right={
            <div style={{ display: 'flex', gap: 6 }}>
              {(['heat', 'lean', 'issue', 'turnout'] as ColorMode[]).map((m) => (
                <button key={m} onClick={() => setColorMode(m)} style={chip(colorMode === m)}>
                  {m === 'heat' ? 'Grievance heat' : m === 'lean' ? 'Lean' : m === 'issue' ? 'Top issue' : 'Turnout intent'}
                </button>
              ))}
            </div>
          }>
            <ConstituencyTileMap
              mode={colorMode}
              byConstituency={data?.byConstituency || []}
              pulseSeat={pulseSeat}
              selected={selected}
              onSelect={(name) => setSelected(name === selected ? null : name)}
            />
          </Panel>

          {/* TOP ISSUES + LEAN side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
            <Panel title="Top issues" sub="count × avg salience · 7-day trend">
              {empty ? <Empty /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data!.byCategory.map((c) => {
                    const max = Math.max(...data!.byCategory.map((x) => x.count), 1);
                    return (
                      <div key={c.category} style={{ display: 'grid', gridTemplateColumns: '110px 1fr 56px', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, textTransform: 'capitalize' }}>{c.category.replace('_', ' ')}</span>
                        <div style={{ height: 16, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                          <div style={{ width: `${(c.count / max) * 100}%`, height: '100%', background: SAFFRON, borderRadius: 4 }} />
                        </div>
                        <span style={{ fontSize: 12, color: MUT, textAlign: 'right' }}>
                          {c.count} {c.trend7d > 0 ? <span style={{ color: SAFFRON }}>▲</span> : c.trend7d < 0 ? <span style={{ color: GREEN }}>▼</span> : '—'}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </Panel>

            <Panel title="Sentiment / lean" sub="overall split + swing targets">
              {empty ? <Empty /> : (
                <>
                  <div style={{ display: 'flex', height: 22, borderRadius: 6, overflow: 'hidden', marginBottom: 10 }}>
                    {LEANS.map((l) => {
                      const tot = LEANS.reduce((s, x) => s + (data!.leanOverall[x] || 0), 0) || 1;
                      const w = ((data!.leanOverall[l] || 0) / tot) * 100;
                      return <div key={l} title={`${l}: ${data!.leanOverall[l] || 0}`} style={{ width: `${w}%`, background: LEAN_COLOR[l] }} />;
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
                    {LEANS.map((l) => (
                      <span key={l} style={{ fontSize: 11, color: MUT, display: 'flex', alignItems: 'center', gap: 5 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 2, background: LEAN_COLOR[l] }} /> {l} {data!.leanOverall[l] || 0}
                      </span>
                    ))}
                  </div>
                  <div style={{ fontSize: 11, color: MUT, marginBottom: 6 }}>SWING TARGETS — highest undecided %</div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 150, overflowY: 'auto' }}>
                    {data!.swing.slice(0, 8).map((s) => (
                      <div key={s.constituency} style={{ display: 'grid', gridTemplateColumns: '1fr 40px', fontSize: 12, gap: 8 }}>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.constituency}</span>
                        <span style={{ color: '#F0B429', textAlign: 'right' }}>{s.undecidedPct}%</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </Panel>
          </div>

          {/* ISSUE x GEOGRAPHY MATRIX */}
          <Panel title="Issue × geography" sub="district (row) × grievance (col)">
            {empty ? <Empty /> : <Matrix data={data!} />}
          </Panel>

          {/* MOBILIZATION + CHANNEL MIX */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(320px,1fr))', gap: 16 }}>
            <Panel title="Mobilization pipeline" sub="who will act">
              {empty ? <Empty /> : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
                  {(['vote', 'volunteer', 'rally', 'share'] as const).map((k) => (
                    <div key={k} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 8, padding: '12px 8px', textAlign: 'center' }}>
                      <div style={{ fontSize: 22, fontWeight: 800, color: GREEN }}>{data!.mobilization[k] || 0}</div>
                      <div style={{ fontSize: 11, color: MUT, textTransform: 'capitalize' }}>{k}</div>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
            <Panel title="Channel mix" sub="which magnet is pulling">
              {empty ? <Empty /> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {data!.channelMix.map((c) => (
                    <div key={c.magnet} style={{ display: 'grid', gridTemplateColumns: '92px 1fr 40px', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontSize: 12, textTransform: 'capitalize' }}>{c.magnet.replace('_', ' ')}</span>
                      <div style={{ height: 14, background: 'rgba(255,255,255,0.05)', borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${c.share}%`, height: '100%', background: '#6EA5D4', borderRadius: 4 }} />
                      </div>
                      <span style={{ fontSize: 12, color: MUT, textAlign: 'right' }}>{c.share}%</span>
                    </div>
                  ))}
                </div>
              )}
            </Panel>
          </div>
        </div>

        {/* ── LIVE FEED (right rail) ───────────────────────────────────── */}
        <div style={{ position: 'sticky', top: 70, display: 'flex', flexDirection: 'column', gap: 8 }}>
          <Panel title="Live feed" sub="we're listening right now" noPad>
            <div style={{ display: 'flex', flexDirection: 'column', maxHeight: 'calc(100vh - 160px)', overflowY: 'auto' }}>
              {(!data || data.liveFeed.length === 0) ? <div style={{ padding: 16 }}><Empty text="Awaiting first captures" /></div> : data.liveFeed.map((f) => (
                <div key={f.id} style={{ padding: '10px 14px', borderBottom: `1px solid ${LINE}`, animation: 'wr-in 0.4s ease' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{maskName(f.name, f.constituency)}</span>
                    <span style={{ fontSize: 11, color: MUT }}>{timeAgo(f.created_at)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: MUT, marginTop: 2 }}>
                    {f.constituency || 'Punjab'} · <span style={{ color: SAFFRON, textTransform: 'capitalize' }}>{(f.category || 'other').replace('_', ' ')}</span>
                  </div>
                </div>
              ))}
            </div>
          </Panel>
        </div>
      </div>

      {/* ── CONSTITUENCY DRAWER ──────────────────────────────────────────── */}
      {selected && (
        <div onClick={() => setSelected(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 40 }}>
          <div onClick={(e) => e.stopPropagation()} style={{ position: 'absolute', top: 0, right: 0, height: '100%', width: 360, maxWidth: '92vw', background: CARD, borderLeft: `1px solid ${LINE}`, padding: 20, overflowY: 'auto', animation: 'wr-slide 0.25s ease' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
              <h2 style={{ margin: 0, fontSize: 18 }}>{selected}</h2>
              <button onClick={() => setSelected(null)} style={chip(false)}>✕</button>
            </div>
            <p style={{ color: MUT, fontSize: 12, marginTop: 0 }}>{CONSTITUENCIES.find((c) => c.name === selected)?.district} · {CONSTITUENCIES.find((c) => c.name === selected)?.region}</p>
            {drawer ? (
              <>
                <div style={{ display: 'flex', gap: 16, margin: '12px 0' }}>
                  <Stat label="Voices" value={drawer.count} />
                  <Stat label="Top issue" value={(drawer.topCategory || '—').replace('_', ' ')} />
                  <Stat label="Vote intent" value={`${Math.round(drawer.voteShare)}%`} />
                </div>
                <FeedForSeat seat={selected} feed={data?.liveFeed || []} />
              </>
            ) : <Empty text="No captures here yet" />}
          </div>
        </div>
      )}

      <style>{`
        @keyframes wr-pulse { 0%{box-shadow:0 0 0 0 rgba(78,180,87,0.7)} 70%{box-shadow:0 0 0 8px rgba(78,180,87,0)} 100%{box-shadow:0 0 0 0 rgba(78,180,87,0)} }
        @keyframes wr-in { from{opacity:0;transform:translateY(-6px)} to{opacity:1;transform:none} }
        @keyframes wr-slide { from{transform:translateX(20px);opacity:0.4} to{transform:none;opacity:1} }
      `}</style>
    </div>
  );
}

// ── small components ────────────────────────────────────────────────────────
function Panel({ title, sub, right, children, noPad }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; noPad?: boolean }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 14px', borderBottom: `1px solid ${LINE}` }}>
        <div>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{title}</div>
          {sub && <div style={{ fontSize: 11, color: MUT }}>{sub}</div>}
        </div>
        {right}
      </div>
      <div style={{ padding: noPad ? 0 : 14 }}>{children}</div>
    </div>
  );
}
function Kpi({ label, value, sub, accent }: { label: string; value: number | string; sub: string; accent: string }) {
  return (
    <div style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: 12, padding: 16 }}>
      <div style={{ fontSize: 12, color: MUT }}>{label}</div>
      <div style={{ fontSize: 30, fontWeight: 800, color: accent, lineHeight: 1.1, marginTop: 4 }}>{value}</div>
      <div style={{ fontSize: 11, color: MUT, marginTop: 2 }}>{sub}</div>
    </div>
  );
}
function Filter({ label, value, onChange, options, fmt }: { label: string; value: string; onChange: (v: string) => void; options: string[]; fmt: (o: string) => string }) {
  return (
    <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value)}
      style={{ background: CARD, color: TXT, border: `1px solid ${LINE}`, borderRadius: 8, padding: '6px 8px', fontSize: 12, maxWidth: 150 }}>
      {options.map((o) => <option key={o} value={o}>{fmt(o)}</option>)}
    </select>
  );
}
function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return <div><div style={{ fontSize: 18, fontWeight: 800 }}>{value}</div><div style={{ fontSize: 11, color: MUT, textTransform: 'capitalize' }}>{label}</div></div>;
}
function Empty({ text = 'Awaiting first captures' }: { text?: string }) {
  return <div style={{ padding: 18, textAlign: 'center', color: MUT, fontSize: 13 }}>{text}</div>;
}
function Matrix({ data }: { data: WarRoomData }) {
  const { districts, categories, cells } = data.matrix;
  const max = Math.max(1, ...districts.flatMap((d) => categories.map((c) => cells[d]?.[c] || 0)));
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', fontSize: 11, width: '100%' }}>
        <thead>
          <tr><th style={{ textAlign: 'left', padding: 4, color: MUT, position: 'sticky', left: 0, background: CARD }}>District</th>
            {categories.map((c) => <th key={c} style={{ padding: 4, color: MUT, textTransform: 'capitalize', fontWeight: 500 }}>{c.replace('_', ' ')}</th>)}</tr>
        </thead>
        <tbody>
          {districts.map((d) => (
            <tr key={d}>
              <td style={{ padding: 4, position: 'sticky', left: 0, background: CARD, whiteSpace: 'nowrap' }}>{d}</td>
              {categories.map((c) => {
                const v = cells[d]?.[c] || 0;
                const a = v === 0 ? 0 : 0.15 + 0.85 * (v / max);
                return <td key={c} style={{ padding: 4, textAlign: 'center', background: `rgba(240,108,24,${a})`, color: a > 0.5 ? '#fff' : MUT, borderRadius: 3 }}>{v || ''}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
function FeedForSeat({ seat, feed }: { seat: string; feed: WarRoomData['liveFeed'] }) {
  const rows = feed.filter((f) => f.constituency === seat).slice(0, 5);
  if (rows.length === 0) return <Empty text="No recent grievances" />;
  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ fontSize: 11, color: MUT, marginBottom: 6 }}>LATEST GRIEVANCES</div>
      {rows.map((f) => (
        <div key={f.id} style={{ padding: '8px 0', borderBottom: `1px solid ${LINE}`, fontSize: 12 }}>
          <span style={{ color: SAFFRON, textTransform: 'capitalize' }}>{(f.category || 'other').replace('_', ' ')}</span>
          <span style={{ color: MUT }}> · {timeAgo(f.created_at)}</span>
        </div>
      ))}
    </div>
  );
}
const chip = (active: boolean): React.CSSProperties => ({
  background: active ? SAFFRON : 'rgba(255,255,255,0.06)',
  color: active ? '#fff' : TXT,
  border: `1px solid ${active ? SAFFRON : LINE}`,
  borderRadius: 99, padding: '5px 10px', fontSize: 11, cursor: 'pointer', whiteSpace: 'nowrap',
});
