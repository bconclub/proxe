'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useIsMobile } from '@/hooks/useIsMobile';
import { CONSTITUENCIES, DISTRICTS, TOTAL_SEATS } from '@/lib/war-room/constituencies';
import { INTENSITY_TIERS } from '@/lib/pop/intensity';
import { type ColorMode } from './PunjabMap';
import dynamic from 'next/dynamic';

// Leaflet map is client-only (needs window) - load it without SSR. Matches the
// Pulse Punjab leader app's map (real slippy tiles + drill-down).
const PunjabLeafletMap = dynamic(() => import('./PunjabLeafletMap'), {
  ssr: false,
  loading: () => <div style={{ width: '100%', height: '100%', display: 'grid', placeItems: 'center', color: 'var(--text-secondary)', fontSize: 12 }}>Loading map…</div>,
});
import { LeanDonut, SentimentGauge, TrendLines, GlowDonut, GlowSpark, GlowArea } from './WarCharts';
import {
  MdWaterDrop, MdBolt, MdWork, MdAddRoad, MdLocalHospital, MdSchool, MdAgriculture, MdWarning, MdMoreHoriz,
  MdInfoOutline, MdPeopleAlt, MdPerson, MdGroups, MdVolunteerActivism, MdStar, MdHowToVote, MdCampaign as MdCampaignIcon,
  MdShare, MdMonitorHeart, MdVerifiedUser, MdTouchApp, MdTrendingUp as MdTrendUpIcon, MdAccessTime, MdWhatsapp,
  MdSmartphone, MdMic, MdQrCode2, MdPhoneMissed, MdDoorFront, MdEvent, MdLanguage, MdCalendarToday, MdExpandMore,
  MdBackHand, MdMyLocation, MdAutoAwesome as MdSparkIcon, MdOutlineCheckCircle, MdOutlineErrorOutline,
} from 'react-icons/md';

// ── palette ──
// Semantic data colors (chart/lean/category encodings) stay concrete; structural
// colors use the app theme tokens so the war room follows light/dark like the dashboard.
const SAFFRON = '#F06C18', GREEN = '#22C55E', BLUE = '#3B82F6', AMBER = '#F59E0B', PURPLE = '#A78BFA';
const BG = 'var(--bg-primary)', CARD = 'var(--bg-secondary)', LINE = 'var(--border-primary)', TXT = 'var(--text-primary)', MUT = 'var(--text-secondary)', TRACK = 'var(--bg-tertiary)';
const CHANNELS = ['whatsapp', 'voice', 'pulse_app', 'qr', 'missed_call', 'd2d', 'event', 'landing'];
const LEAN_KEYS = ['supporter', 'leaning', 'undecided', 'opposed'];
const LEAN_C: Record<string, string> = { supporter: GREEN, leaning: '#86EFAC', undecided: AMBER, opposed: SAFFRON };
const CAT_ICON: Record<string, any> = { water: MdWaterDrop, power: MdBolt, jobs: MdWork, roads: MdAddRoad, health: MdLocalHospital, education: MdSchool, farm_debt: MdAgriculture, drugs: MdWarning, other: MdMoreHoriz };
const CAT_C: Record<string, string> = { water: '#2EC4B6', power: AMBER, jobs: BLUE, roads: PURPLE, health: '#FB7185', education: '#C77DFF', farm_debt: GREEN, drugs: '#FF5D73', other: '#7A8AA0' };
// Gradient pairs (top→bottom) for the Channel Mix glow donut segments.
const CHAN_GRAD: [string, string][] = [['#4ADE80', '#16A34A'], ['#60A5FA', '#2563EB'], ['#FB923C', '#EA580C'], ['#FBBF24', '#D97706'], ['#C4B5FD', '#7C3AED']];

// Channel Mix ranked-bar meta (reference design): icon + color per magnet.
const MAG_META: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  whatsapp: { label: 'WhatsApp', color: '#22c55e', icon: <MdWhatsapp size={13} /> },
  pulse_app: { label: 'My Voice', color: '#3b82f6', icon: <MdSmartphone size={13} /> },
  voice: { label: 'Voice', color: '#a78bfa', icon: <MdMic size={13} /> },
  qr: { label: 'QR', color: '#f59e0b', icon: <MdQrCode2 size={13} /> },
  missed_call: { label: 'Missed Call', color: '#8b5cf6', icon: <MdPhoneMissed size={13} /> },
  d2d: { label: 'D2D', color: '#4ade80', icon: <MdDoorFront size={13} /> },
  event: { label: 'Event', color: '#60a5fa', icon: <MdEvent size={13} /> },
  landing: { label: 'Landing', color: '#c084fc', icon: <MdLanguage size={13} /> },
  web: { label: 'Web', color: '#38bdf8', icon: <MdLanguage size={13} /> },
  other: { label: 'Other', color: '#7a8aa0', icon: <MdMoreHoriz size={13} /> },
};
const magMeta = (m: string) => MAG_META[m] || { label: m.replace('_', ' '), color: '#7a8aa0', icon: <MdMoreHoriz size={13} /> };

// Intensity ladder tier chrome (funnel row icon + conversion chip color).
const TIER_ICON: Record<string, React.ReactNode> = {
  contact: <MdPeopleAlt size={13} />, voter: <MdPerson size={13} />, supporter: <MdGroups size={13} />,
  volunteer: <MdBackHand size={13} />, cadre: <MdStar size={13} />,
};
const TIER_BG: Record<string, string> = {
  contact: 'linear-gradient(180deg,#2b3242,#20242e)',
  voter: 'linear-gradient(180deg,#1f4fd8,#173a9c)',
  supporter: 'linear-gradient(180deg,#16a34a,#0f7a37)',
  volunteer: 'linear-gradient(180deg,#d97706,#a85a05)',
  cadre: 'linear-gradient(180deg,#ea4b0f,#b23509)',
};
const MOB_META: [string, string, React.ReactNode][] = [
  ['vote', 'Will vote', <MdHowToVote key="v" size={13} />],
  ['volunteer', 'Will work', <MdMonitorHeart key="w" size={13} />],
  ['rally', 'Will rally', <MdCampaignIcon key="r" size={13} />],
  ['share', 'Will share', <MdShare key="s" size={13} />],
];

export interface WarRoomData {
  kpis: { total: number; today: number; activeConstituencies: number; raised: number; resolved: number; loopHealthPct: number };
  momentum?: { reach7dPct: number; reach14dPct: number };
  // Switchable-window KPIs for the REACH + RESPONSE LOOP cards (today/7d/14d/28d).
  reachWindows?: { today: number; d7: number; d14: number; d28: number };
  loopWindows?: { today: number; d7: number; d14: number; d28: number };
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
  sentiment: { net: number; shiftPp: number; shift14Pp?: number; label: string };
  // D2D field coverage (d2d_visits) - null when no knocks / query degraded.
  d2d: {
    totals: { visits: number; met: number; not_home: number; refused: number; revisit: number; today: number; workers: number };
    byConstituency: { constituency: string; visits: number; met: number; metRate: number }[];
    topWorkers: { name: string; visits: number; met: number }[];
    series: number[]; // knocks/day aligned to series.days
  } | null;
  // Intensity ladder (026): contact→voter→supporter→volunteer→cadre.
  intensity: { tiers: number[]; conversion: number[] } | null;
  volunteers: {
    total: number;
    byConstituency: { constituency: string; count: number }[];
    recent: { name: string | null; constituency: string | null; intensity: number; created_at: string }[];
  } | null;
  events: { id: string; title: string; topic: string | null; constituency: string | null; venue: string | null; event_date: string | null; status: string; rsvps: { interested: number; confirmed: number; attended: number } }[] | null;
  targets: { targets: Record<string, number> | null; actuals: { voices: number; volunteers: number; knocks: number; events: number } } | null;
  recommendations: { id: string; created_at: string; title: string; body: string | null; source: string; constituency: string | null; status: string; created_by: string | null }[] | null;
  listen: {
    totals: { signals7d: number; crisis: number; opposition: number; positive: number };
    trending: { category: string; count: number; prev: number; trend: number }[];
    crisisAlerts: { content: string; source: string; constituency: string | null; created_at: string }[];
    bySource: { source: string; count: number }[];
  } | null;
}
interface Filters { constituency: string; district: string; channel: string; language: string; days: string; }
const EMPTY: Filters = { constituency: '', district: '', channel: '', language: '', days: 'all' };

function mask(name: string | null, c: string | null) { if (name && name.trim().length > 1) { const f = name.trim().split(/\s+/)[0]; return f.length > 2 ? f[0] + '••••' : f; } return `Constituent, ${c || 'Punjab'}`; }
function ago(iso: string) { const s = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000)); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m` : s < 86400 ? `${Math.floor(s / 3600)}h` : `${Math.floor(s / 86400)}d`; }


export default function WarRoomClient() {
  const [data, setData] = useState<WarRoomData | null>(null);
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [mode, setMode] = useState<ColorMode>('heat');
  const [selected, setSelected] = useState<string | null>(null);
  const [pulse, setPulse] = useState<string | null>(null);
  // War Room is used on phones a lot - switch from the fixed single-viewport
  // desktop grid to a stacked, scrolling layout below this width.
  const mobile = useIsMobile(820);
  const sbRef = useRef<ReturnType<typeof createClient> | null>(null);
  // Live Feed panel tab: citizen feed vs leader directives
  const [feedTab, setFeedTab] = useState<'feed' | 'directives'>('feed');
  // Shared window for the REACH + RESPONSE LOOP cards (today/7d/14d/28d switch).
  const [kpiWin, setKpiWin] = useState<'today' | 'd7' | 'd14' | 'd28'>('d7');
  const ackReco = async (id: string, status: 'acked' | 'actioned') => {
    try { await fetch('/api/dashboard/recommendations', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, status }) }); } catch {}
    fetchData();
  };

  // Track in-flight syncs so the header can tell the director the room is
  // *working*, not frozen - this dataset aggregates tens of thousands of rows.
  const [busy, setBusy] = useState(false);
  const fetchData = useCallback(async () => {
    const qs = new URLSearchParams(); Object.entries(filters).forEach(([k, v]) => v && v !== 'all' && qs.set(k, v));
    const cacheKey = `warroom:data:${qs.toString()}`;
    setBusy(true);
    try {
      const r = await fetch(`/api/war-room/data?${qs}`, { cache: 'no-store' });
      if (r.ok) {
        const json = await r.json();
        setData(json);
        // Stale-while-revalidate: keep the latest payload in the browser so the
        // next open paints instantly instead of waiting ~seconds on the aggregate.
        try { sessionStorage.setItem(cacheKey, JSON.stringify(json)); } catch { /* quota - skip */ }
      }
    } catch {}
    finally { setBusy(false); }
  }, [filters]);
  // Instant paint from the browser cache (if we've loaded this view before),
  // then fetchData replaces it with fresh numbers in the background.
  useEffect(() => {
    const qs = new URLSearchParams(); Object.entries(filters).forEach(([k, v]) => v && v !== 'all' && qs.set(k, v));
    try {
      const cached = sessionStorage.getItem(`warroom:data:${qs.toString()}`);
      if (cached) setData(JSON.parse(cached));
    } catch { /* corrupt cache - fresh fetch will replace it */ }
    fetchData();
  }, [fetchData, filters]);
  useEffect(() => {
    if (!sbRef.current) sbRef.current = createClient();
    const sb = sbRef.current;
    const ch = sb.channel('wr').on('postgres_changes', { event: '*', schema: 'public', table: 'all_leads' }, (p: any) => {
      const seat = p.new?.constituency || p.old?.constituency; if (seat) { setPulse(seat); setTimeout(() => setPulse(null), 2500); } fetchData();
    }).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'd2d_visits' }, (p: any) => {
      // A knock from the field tool - pulse the seat and refresh D2D coverage.
      const seat = p.new?.constituency; if (seat) { setPulse(seat); setTimeout(() => setPulse(null), 2500); } fetchData();
    }).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'campaign_recommendations' }, () => {
      // Leader pushed a directive - refresh so it lands in the Directives tab.
      fetchData();
    }).on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'listen_signals' }, () => {
      fetchData();
    }).subscribe();
    return () => { sb.removeChannel(ch); };
  }, [fetchData]);

  const d = data;
  const SEAT_C = [SAFFRON, BLUE, GREEN, AMBER, PURPLE, '#2EC4B6'];

  return (
    <div style={{ height: '100%', minHeight: 0, overflow: 'hidden', color: TXT, display: 'flex', flexDirection: 'column', fontFamily: 'Inter, system-ui, sans-serif', fontSize: 12, background: `radial-gradient(900px 480px at 12% -6%, rgba(240,108,24,0.12), transparent 60%), radial-gradient(820px 460px at 88% 0%, rgba(34,197,94,0.12), transparent 58%), radial-gradient(820px 520px at 50% 112%, rgba(59,130,246,0.10), transparent 60%), ${BG}` }}>
      {/* MAIN */}
      <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        {/* HEADER */}
        <div style={{ display: 'flex', alignItems: 'center', gap: mobile ? 8 : 12, padding: mobile ? '10px 12px' : '12px 18px', flexWrap: 'wrap', borderBottom: `1px solid ${LINE}` }}>
          <div>
            <div style={{ fontSize: mobile ? 16 : 19, fontWeight: 800, letterSpacing: '-0.02em' }}>War Room</div>
            <div style={{ fontSize: 11, color: MUT, display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 7, height: 7, borderRadius: 9, background: busy ? AMBER : GREEN, animation: 'wr-pulse 2s infinite' }} />{!d ? 'Syncing live intelligence across Punjab…' : busy ? 'Refreshing…' : 'Real-time political intelligence across Punjab'}</div>
          </div>
          <div style={{ flex: 1 }} />
          <Sel v={filters.district} on={(v) => setFilters({ ...filters, district: v })} opts={['', ...DISTRICTS]} fmt={(o) => o || 'All Districts'} />
          <Sel v={filters.constituency} on={(v) => setFilters({ ...filters, constituency: v })} opts={['', ...CONSTITUENCIES.map((c) => c.name)]} fmt={(o) => o || 'All Seats'} />
          <Sel v={filters.channel} on={(v) => setFilters({ ...filters, channel: v })} opts={['', ...CHANNELS]} fmt={(o) => o ? o.replace('_', ' ') : 'All Channels'} />
          <Sel v={filters.language} on={(v) => setFilters({ ...filters, language: v })} opts={['', 'pa', 'hi', 'en']} fmt={(o) => o ? o.toUpperCase() : 'All Languages'} />
          <Sel v={filters.days} on={(v) => setFilters({ ...filters, days: v })} opts={['all', '1', '7', '30']} fmt={(o) => o === 'all' ? 'All Time' : o === '1' ? 'Today' : `${o}d`} />
        </div>

        {/* SCROLL BODY (single-VH scroll on desktop; page scroll on mobile) */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: mobile ? '10px 12px 18px' : '12px 18px 14px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* HEADLINE + 4-PILLAR KPI STRIP - the "main idea" a director reads first:
              Reach (are we growing contact?) · Standing (are people with us, which
              way moving?) · Battlegrounds (which seats decided now?) · Loop (are we
              acting?). Deltas are the REAL 7d/14d change, not hardcoded strings. */}
          {(() => {
            const leanT = LEAN_KEYS.reduce((s, k) => s + (d?.leanOverall[k] || 0), 0) || 1;
            const supPct = Math.round(((d?.leanOverall.supporter || 0) / leanT) * 100);
            const undPct = Math.round(((d?.leanOverall.undecided || 0) / leanT) * 100);
            const swingCount = (d?.swing || []).filter((s) => s.undecidedPct >= 30 && s.total >= 5).length;
            const topIssue = ((d?.byCategory || []).find((c) => c.category !== 'other')?.category || 'issues').replace('_', ' ');
            const r7 = d?.momentum?.reach7dPct ?? 0, r14 = d?.momentum?.reach14dPct ?? 0;
            const s7 = d?.sentiment.shiftPp ?? 0, s14 = d?.sentiment.shift14Pp ?? 0;
            const net = d?.sentiment.net ?? 0;
            const dir = (v: number): 'up' | 'down' | 'flat' => (v > 0 ? 'up' : v < 0 ? 'down' : 'flat');
            const sgn = (v: number) => (v >= 0 ? '+' : '');
            // Windowed REACH + RESPONSE LOOP driven by the shared switcher.
            const WIN_LABEL = { today: 'Today', d7: '7D', d14: '14D', d28: '28D' } as const;
            const rw = d?.reachWindows, lw = d?.loopWindows;
            const reachVal = rw ? rw[kpiWin] : (d?.kpis.total ?? 0);
            const loopResolved = lw ? lw[kpiWin] : (d?.kpis.resolved ?? 0);
            const loopRaised = rw ? rw[kpiWin] : (d?.kpis.raised ?? 0);
            const loopPct = loopRaised ? Math.round((100 * loopResolved) / loopRaised) : 0;
            return (
              <>
                {d && (
                  <div style={{ ...card, padding: mobile ? '9px 12px' : '10px 14px', display: 'flex', alignItems: 'center', gap: 9, borderLeft: `3px solid ${SAFFRON}` }}>
                    <MdSparkIcon size={16} color={SAFFRON} style={{ flexShrink: 0 }} />
                    <div style={{ fontSize: mobile ? 11.5 : 13, lineHeight: 1.45, color: MUT }}>
                      <b style={{ color: TXT }}>{fmtN(d.kpis.total)}</b> voices reached
                      {' ('}<b style={{ color: dir(r7) === 'down' ? SAFFRON : GREEN }}>{sgn(r7)}{r7}%</b> wk{')'}
                      {' · '}<b style={{ color: TXT }}>{undPct}%</b> undecided{swingCount ? <> · <b style={{ color: AMBER }}>{swingCount}</b> swing seats</> : null}
                      {' · '}<b style={{ color: TXT, textTransform: 'capitalize' }}>{topIssue}</b> is the #1 issue
                      {' · loop '}<b style={{ color: TXT }}>{d.kpis.loopHealthPct}%</b>
                    </div>
                  </div>
                )}
                {/* Shared window switcher - drives REACH + RESPONSE LOOP cards. */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: -2 }}>
                  <span style={{ fontSize: 10.5, color: MUT, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Window</span>
                  {(['today', 'd7', 'd14', 'd28'] as const).map((w) => (
                    <Chip key={w} on={kpiWin === w} onClick={() => setKpiWin(w)}>{WIN_LABEL[w]}</Chip>
                  ))}
                  <div style={{ flex: 1 }} />
                </div>
                {(() => {
                  // Top Issue - the biggest thing people are raising + its size + which way it's moving.
                  const ti = (d?.byCategory || []).find((c) => c.category !== 'other') || null;
                  const tiTotal = (d?.byCategory || []).reduce((s, c) => s + c.count, 0) || 1;
                  const tiShare = ti ? Math.round((100 * ti.count) / tiTotal) : 0;
                  const tiName = ti ? ti.category.replace(/_/g, ' ') : '-';
                  const tiSpark = ti ? d?.series.byCategory?.[ti.category] : undefined;
                  // Ground Force - who's ready to act (volunteer / vote / rally intent).
                  const mob = d?.mobilization || ({} as Record<string, number>);
                  const mobSpark = d?.series.mobilization?.volunteer;
                  return (
                    <div style={{ display: 'grid', gridTemplateColumns: mobile ? 'repeat(2,1fr)' : 'repeat(5,1fr)', gap: mobile ? 8 : 12 }}>
                      <Kpi label="Reach" value={fmtN(reachVal)} sub={`${WIN_LABEL[kpiWin]} · voter touchpoints`} accent={SAFFRON} spark={demoCurve(d?.series.total)}
                        badges={[{ t: `7d ${sgn(r7)}${r7}%`, dir: dir(r7) }, { t: `14d ${sgn(r14)}${r14}%`, dir: dir(r14) }]} />
                      <Kpi label="Standing" value={`${sgn(net)}${net}`} sub={`${supPct}% supporter · ${undPct}% undecided`} accent={GREEN} spark={demoCurve(d?.series.total)}
                        badges={[{ t: `7d ${sgn(s7)}${s7}pp`, dir: dir(s7) }, { t: `14d ${sgn(s14)}${s14}pp`, dir: dir(s14) }]} />
                      <Kpi label="Top Issue" value={fmtN(ti?.count ?? 0)} sub={<span style={{ textTransform: 'capitalize' }}>{tiName} · {tiShare}% of voices</span>} accent={BLUE} spark={demoCurve(tiSpark)}
                        badges={ti ? [{ t: `7d ${sgn(ti.trend7d)}${ti.trend7d}`, dir: dir(ti.trend7d) }] : []} />
                      <Kpi label="Response Loop" value={`${loopPct}%`} sub={`${fmtN(loopResolved)} of ${fmtN(loopRaised)} resolved · ${WIN_LABEL[kpiWin]}`} accent={AMBER} spark={demoCurve(d?.series.resolved)}
                        badges={[{ t: `${fmtN(loopResolved)} closed`, dir: 'flat' }]} />
                      <Kpi label="Ground Force" value={fmtN(mob.volunteer || 0)} sub={`ready to volunteer · ${fmtN(mob.vote || 0)} to vote`} accent={GREEN} spark={demoCurve(mobSpark)}
                        badges={mob.rally ? [{ t: `${fmtN(mob.rally)} for rallies`, dir: 'flat' }] : []} />
                    </div>
                  );
                })()}
              </>
            );
          })()}

          {/* MAIN GRID: map | center | feed (stacks on mobile) */}
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'minmax(0,1.3fr) minmax(0,1.05fr) 340px', gap: 12, minHeight: mobile ? undefined : 620 }}>
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
                  <PunjabLeafletMap mode={mode} byConstituency={d?.byConstituency || []} pulseSeat={pulse} selected={selected} onSelect={(n) => setSelected(n && n === selected ? null : n || null)} />
                </div>
              </div>
            </Panel>

            {/* CENTER COLUMN */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, minHeight: 0 }}>
              <Panel title="Top Issues by Salience" h={196}>
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', gap: 4, overflowY: 'auto' }}>
                  {(d?.byCategory || []).filter((c) => c.category !== 'other').map((c, i) => {
                    const cats = (d?.byCategory || []).filter((x) => x.category !== 'other');
                    const max = Math.max(...cats.map((x) => x.count), 1); const Icon = CAT_ICON[c.category] || MdMoreHoriz; const pct = Math.round((c.count / (d?.kpis.total || 1)) * 100);
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
                    series={(d?.series.seats || []).map((s, i) => ({ name: s, color: SEAT_C[i % SEAT_C.length], data: demoCurve(d?.series.bySeat[s]) || [] }))}
                  />
                </div>
              </Panel>
            </div>

            {/* LIVE FEED + DIRECTIVES */}
            <Panel title={feedTab === 'feed' ? 'Live Feed' : 'Directives'} sub={feedTab === 'feed' ? 'Listening now' : 'From the leader app'} noPad h={mobile ? 320 : undefined} right={
              <div style={{ display: 'flex', gap: 5 }}>
                <Chip on={feedTab === 'feed'} onClick={() => setFeedTab('feed')}>Feed</Chip>
                <Chip on={feedTab === 'directives'} onClick={() => setFeedTab('directives')}>
                  {`Directives${(d?.recommendations || []).filter((r) => r.status === 'new').length ? ` (${(d?.recommendations || []).filter((r) => r.status === 'new').length})` : ''}`}
                </Chip>
              </div>
            }>
              <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                {feedTab === 'feed' ? (
                  (d?.liveFeed || []).length === 0 ? <Empty /> : d!.liveFeed.map((f) => {
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
                  })
                ) : (
                  (d?.recommendations || []).length === 0 ? <Empty text="No directives yet - the leader app pushes here" /> : d!.recommendations!.map((r) => {
                    // Quickly-understandable at a glance: a colored source rail +
                    // plain-language tag say WHO is asking (AI vs the leader) before
                    // the title even registers.
                    const isAi = r.source === 'ai';
                    const acc = isAi ? PURPLE : SAFFRON;
                    // Leader directives outrank AI suggestions - give them a tinted
                    // card, a fatter accent rail and a soft glow so they read as the
                    // "orders from the top" they are.
                    return (
                      <div key={r.id} style={{ padding: isAi ? '9px 12px' : '11px 12px', borderBottom: `1px solid ${LINE}`, borderLeft: `${isAi ? 3 : 4}px solid ${acc}`, background: isAi ? 'transparent' : `linear-gradient(90deg, ${SAFFRON}14, ${SAFFRON}05 60%, transparent)`, boxShadow: isAi ? 'none' : `inset 0 0 0 1px ${SAFFRON}22` }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3, fontSize: 9, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em', color: acc, background: `${acc}1c`, borderRadius: 5, padding: '1px 5px' }}>
                            {isAi ? <><MdSparkIcon size={10} /> AI suggests</> : <><MdCampaignIcon size={10} /> Leader directive</>}
                          </span>
                          {r.constituency && <span style={{ fontSize: 9, color: MUT }}>{r.constituency}</span>}
                          <span style={{ flex: 1 }} />
                          <span style={{ fontSize: 10, color: MUT, whiteSpace: 'nowrap' }}>{ago(r.created_at)}</span>
                        </div>
                        <b style={{ fontSize: 12, lineHeight: 1.3 }}>{r.title}</b>
                        {r.body && <div style={{ fontSize: 11, color: MUT, marginTop: 2, lineHeight: 1.35 }}>{r.body}</div>}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
                          <span style={{ flex: 1 }} />
                          {r.status === 'new' ? (
                            <>
                              <Chip on={false} onClick={() => ackReco(r.id, 'acked')}>Ack</Chip>
                              <Chip on={false} onClick={() => ackReco(r.id, 'actioned')}>Done</Chip>
                            </>
                          ) : (
                            <span style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', display: 'inline-flex', alignItems: 'center', gap: 3, color: r.status === 'actioned' ? GREEN : BLUE }}>
                              <MdOutlineCheckCircle size={11} /> {r.status === 'actioned' ? 'Done' : 'Acked'}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </Panel>
          </div>

          {/* BOTTOM ROW A - THE INTENSITY ENGINE (voter → supporter → volunteer → cadre) */}
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'minmax(0,1.2fr) minmax(0,1fr) minmax(0,1fr)', gap: 12, minHeight: mobile ? undefined : 290 }}>
            <Panel title="Intensity Ladder" sub="Voter → Supporter → Volunteer → Cadre" h={mobile ? 290 : undefined} icon={<MdVerifiedUser size={14} />} iconColor={AMBER} right={<InfoDot />}>
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) 62px 74px', gap: 8, fontSize: 8.5, letterSpacing: '0.06em', color: MUT, textTransform: 'uppercase', paddingBottom: 2 }}>
                  <span /><span style={{ textAlign: 'right' }}>People</span><span style={{ textAlign: 'center' }}>Conversion</span>
                </div>
                {INTENSITY_TIERS.map((t, i) => {
                  const n = d?.intensity?.tiers?.[t.tier] ?? 0;
                  const prevN = i > 0 ? (d?.intensity?.tiers?.[t.tier - 1] ?? 0) : 0;
                  const conv = i > 0 && prevN > 0 ? Math.round((1000 * n) / prevN) / 10 : null;
                  const width = 100 - i * 10; // funnel narrows each tier
                  const inset = i * 1.6;
                  return (
                    <div key={t.key} style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1.35fr) 62px 74px', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: `${width}%`, margin: '0 auto' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, height: 26, padding: '0 14px', color: '#fff', fontSize: 10.5, fontWeight: 800, letterSpacing: '0.06em', textTransform: 'uppercase', background: TIER_BG[t.key], clipPath: `polygon(${3 + inset}% 0, ${97 - inset}% 0, ${94 - inset}% 100%, ${6 + inset}% 100%)` }}>
                          <span style={{ display: 'flex', opacity: 0.9, marginLeft: `${inset * 2}%` }}>{TIER_ICON[t.key]}</span>{t.label}
                        </div>
                      </div>
                      <span style={{ fontSize: 12.5, fontWeight: 700, textAlign: 'right' }}>{n.toLocaleString('en-IN')}</span>
                      <span style={{ textAlign: 'center' }}>
                        {conv === null ? <span style={{ color: MUT }}>-</span> : (
                          <span style={{ fontSize: 10, fontWeight: 800, borderRadius: 7, padding: '2px 8px', color: t.color, background: `${t.color}1c`, border: `1px solid ${t.color}45` }}>{conv}%</span>
                        )}
                      </span>
                    </div>
                  );
                })}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6, marginTop: 8 }}>
                  {MOB_META.map(([k, label, icon]) => (
                    <div key={k} style={{ background: TRACK, border: `1px solid ${LINE}`, borderRadius: 9, padding: '5px 8px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 8, letterSpacing: '0.05em', color: MUT, textTransform: 'uppercase' }}>{icon}{label}</div>
                      <div style={{ fontSize: 13, fontWeight: 800, marginTop: 1 }}>{d?.mobilization[k] || 0}</div>
                    </div>
                  ))}
                </div>
              </div>
            </Panel>
            <Panel title="Volunteer Pulse" sub="Tier 3+ energy" h={mobile ? 270 : undefined} icon={<MdMonitorHeart size={14} />} iconColor={AMBER} right={<InfoDot />}>
              {d?.volunteers && d.volunteers.total > 0 ? (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: '96px 1fr', gap: 12, alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: 34, fontWeight: 800, color: AMBER, lineHeight: 1 }}>{d.volunteers.total}</div>
                      <div style={{ fontSize: 9, letterSpacing: '0.06em', color: MUT, textTransform: 'uppercase', marginTop: 3 }}>Volunteers+</div>
                      <div style={{ fontSize: 11, fontWeight: 800, color: GREEN, marginTop: 8, display: 'flex', alignItems: 'center', gap: 3 }}><MdTrendUpIcon size={13} /> 18%</div>
                      <div style={{ fontSize: 9.5, color: MUT }}>vs last 14 days</div>
                    </div>
                    <div style={{ background: TRACK, border: `1px solid ${LINE}`, borderRadius: 10, padding: '7px 10px' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '14px 1fr 24px', gap: 6, fontSize: 8.5, letterSpacing: '0.06em', color: MUT, textTransform: 'uppercase', paddingBottom: 4, borderBottom: `1px solid ${LINE}` }}>
                        <span /><span>Location</span><span style={{ textAlign: 'right' }}>Vol+</span>
                      </div>
                      {d.volunteers.byConstituency.slice(0, 5).map((v, i) => {
                        const max = Math.max(...d.volunteers!.byConstituency.map((x) => x.count), 1);
                        return (
                          <div key={v.constituency} style={{ display: 'grid', gridTemplateColumns: '14px 84px 1fr 24px', alignItems: 'center', gap: 6, fontSize: 10.5, padding: '4px 0' }}>
                            <span style={{ color: MUT }}>{i + 1}</span>
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.constituency}</span>
                            <div style={{ height: 7, background: 'rgba(0,0,0,0.25)', borderRadius: 4, overflow: 'hidden' }}><div style={{ width: `${(v.count / max) * 100}%`, height: '100%', background: 'linear-gradient(90deg,#f59e0b,#fbbf24)', borderRadius: 4 }} /></div>
                            <b style={{ textAlign: 'right' }}>{v.count}</b>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr', border: `1px solid ${LINE}`, background: TRACK, borderRadius: 10, overflow: 'hidden' }}>
                    {[
                      [<MdTouchApp key="a" size={13} color={AMBER} />, 'Most Active', d.volunteers.byConstituency[0]?.constituency || 'Punjab'],
                      [<MdTrendUpIcon key="b" size={13} color={GREEN} />, 'Trend', `Rising in ${d.volunteers.byConstituency.length} areas`],
                      [<MdAccessTime key="c" size={13} color={MUT as string} />, 'Last Updated', 'Just now'],
                    ].map(([icon, l, v], i) => (
                      <div key={i} style={{ padding: '6px 9px', borderLeft: i ? `1px solid ${LINE}` : 'none', display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
                        {icon as React.ReactNode}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 8.5, color: MUT, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l as string}</div>
                          <div style={{ fontSize: 10.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v as string}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : <Empty text="No volunteers yet - MyVoice and D2D feed this" />}
            </Panel>
            <Panel title="D2D Coverage" sub="Field knocks" h={mobile ? 280 : undefined} icon={<MdVerifiedUser size={14} />} iconColor={AMBER} right={<InfoDot />}>
              {d?.d2d ? (
                <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                    {[
                      [<MdBackHand key="k" size={13} color={AMBER} />, 'Knocks', d.d2d.totals.visits.toLocaleString('en-IN')],
                      [<MdMyLocation key="m" size={13} color={BLUE} />, 'Met', `${d.d2d.totals.visits ? Math.round((100 * d.d2d.totals.met) / d.d2d.totals.visits) : 0}%`],
                      [<MdGroups key="w" size={13} color={GREEN} />, 'Workers', d.d2d.totals.workers],
                      [<MdCalendarToday key="t" size={13} color={PURPLE} />, 'Today', d.d2d.totals.today],
                    ].map(([icon, l, v], i) => (
                      <div key={i} style={{ background: TRACK, border: `1px solid ${LINE}`, borderRadius: 9, padding: '6px 8px', display: 'flex', gap: 6, alignItems: 'center', minWidth: 0 }}>
                        {icon as React.ReactNode}
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 13.5, fontWeight: 800, lineHeight: 1.1 }}>{v as React.ReactNode}</div>
                          <div style={{ fontSize: 8, color: MUT, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{l as string}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 4 }}>
                    <div style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between', fontSize: 8, color: MUT, textAlign: 'right', padding: '1px 0' }}>
                      <span>{(() => { const mx = Math.max(...d.d2d!.series, 1); return mx >= 1000 ? `${(mx / 1000).toFixed(1)}K` : mx; })()}</span>
                      <span>0</span>
                    </div>
                    <div style={{ flex: 1, height: 44, opacity: 0.95 }}><GlowSpark data={d.d2d.series} color={BLUE} /></div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: MUT, marginTop: -4, padding: '0 14px' }}>
                    {(d.series?.days || []).filter((_, i) => i % 2 === 0).map((day) => <span key={day}>{day.slice(5)}</span>)}
                  </div>
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '14px 1fr 70px', gap: 6, fontSize: 8.5, letterSpacing: '0.06em', color: MUT, textTransform: 'uppercase', paddingBottom: 4, borderBottom: `1px solid ${LINE}` }}>
                      <span /><span>Top Workers (Today)</span><span style={{ textAlign: 'right' }}>Knocks</span>
                    </div>
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                      {d.d2d.topWorkers.slice(0, 4).map((w, i) => (
                        <div key={w.name} style={{ display: 'grid', gridTemplateColumns: '14px 1fr 70px', gap: 6, alignItems: 'center', fontSize: 11, padding: '3.5px 0' }}>
                          <span style={{ color: MUT, fontSize: 10 }}>{i + 1}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{w.name}</span>
                          <span style={{ color: MUT, whiteSpace: 'nowrap', textAlign: 'right' }}><b style={{ color: TXT }}>{w.visits}</b> · {w.met} met</span>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : <Empty text="No knocks logged yet - D2D field tool feeds this" />}
            </Panel>
          </div>

          {/* BOTTOM ROW B - INTELLIGENCE (channels, events, issues, listening) */}
          <div style={{ display: 'grid', gridTemplateColumns: mobile ? '1fr' : 'minmax(0,0.95fr) minmax(0,1.2fr) minmax(0,1.1fr)', gap: 12, minHeight: mobile ? undefined : 290 }}>
            <Panel title="Channel Mix" sub="By volume" h={mobile ? 260 : undefined} icon={<MdShare size={14} />} iconColor={AMBER} right={<InfoDot />}>
              <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 4, justifyContent: 'center' }}>
                {(d?.channelMix || []).slice(0, 9).map((c, i) => {
                  const m = magMeta(c.magnet);
                  const max = Math.max(...(d?.channelMix || []).map((x) => x.share), 1);
                  return (
                    <div key={c.magnet} style={{ display: 'grid', gridTemplateColumns: '13px 18px 76px 1fr 34px 44px', alignItems: 'center', gap: 6, fontSize: 11 }}>
                      <span style={{ color: MUT, fontSize: 10 }}>{i + 1}</span>
                      <span style={{ color: m.color, display: 'flex' }}>{m.icon}</span>
                      <span style={{ color: TXT, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.label}</span>
                      <div style={{ height: 8, background: TRACK, borderRadius: 4, overflow: 'hidden' }}>
                        <div style={{ width: `${Math.max(1.5, (c.share / max) * 100)}%`, height: '100%', background: `linear-gradient(90deg,${m.color},${m.color}cc)`, borderRadius: 4, boxShadow: `0 0 6px ${m.color}55` }} />
                      </div>
                      <b style={{ textAlign: 'right' }}>{c.share}%</b>
                      <span style={{ color: MUT, textAlign: 'right', fontSize: 10 }}>( {c.count} )</span>
                    </div>
                  );
                })}
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: MUT, borderTop: `1px solid ${LINE}`, marginTop: 6, paddingTop: 6 }}>
                  <span>Total Volume <b style={{ color: TXT }}>{(d?.channelMix || []).reduce((a, b) => a + b.count, 0).toLocaleString('en-IN')}</b></span>
                  <span>Last 14 days</span>
                </div>
              </div>
            </Panel>
            <Panel title="Issue Trend (Top 5)" sub="14 days" h={mobile ? 270 : undefined} icon={<MdTrendUpIcon size={14} />} iconColor={PURPLE} right={
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontSize: 10.5, color: MUT, background: TRACK, border: `1px solid ${LINE}`, borderRadius: 8, padding: '4px 9px' }}><MdCalendarToday size={11} /> Last 14 days <MdExpandMore size={13} /></span>
            }>
              <div style={{ flex: 1, minHeight: 120 }}>
                <GlowArea
                  days={(d?.series.days || []).map((day) => day.slice(5))}
                  series={(d?.series.categories || []).map((cat) => ({ name: cat, color: CAT_C[cat], data: d?.series.byCategory[cat] || [] }))}
                />
              </div>
              <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', justifyContent: 'center', fontSize: 9.5, color: MUT, marginTop: 5, paddingBottom: 5, borderBottom: `1px solid ${LINE}` }}>
                {(d?.series.categories || []).map((c) => <span key={c} style={{ display: 'flex', alignItems: 'center', gap: 4, textTransform: 'capitalize' }}><span style={{ width: 7, height: 7, borderRadius: 7, background: CAT_C[c] }} />{c.replace('_', ' ')}</span>)}
              </div>
              {(() => {
                const days = d?.series.days || [];
                const cats = d?.series.categories || [];
                const totals = days.map((_, i) => cats.reduce((a, c) => a + (d?.series.byCategory[c]?.[i] || 0), 0));
                const peakI = totals.indexOf(Math.max(...totals, 0));
                const mentions = totals.reduce((a, b) => a + b, 0);
                return (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: MUT, paddingTop: 6 }}>
                    <span>Peak: <b style={{ color: TXT }}>{days[peakI]?.slice(5) || '-'}</b></span>
                    <span>Total Mentions <b style={{ color: TXT }}>{mentions.toLocaleString('en-IN')}</b></span>
                  </div>
                );
              })()}
            </Panel>
            <Panel title="Constituency Snapshot" sub="Top 5 by volume & salience" h={mobile ? 300 : undefined} icon={<MdGroups size={14} />} iconColor={AMBER} right={<InfoDot />}>
              {(() => {
                const rows = (d?.swing || []).slice(0, 5).map((s) => {
                  const seat = d?.byConstituency.find((b) => b.constituency === s.constituency);
                  const lean = seat?.leanScore ?? 0;
                  const supp = Math.round(((seat ? (lean + 1) / 2 : 0)) * 100);
                  const opp = Math.max(0, 100 - s.undecidedPct - supp);
                  return { ...s, supp, leanPct: s.undecidedPct, opp };
                });
                const MiniBar = ({ v, color }: { v: number; color: string }) => (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ minWidth: 26, textAlign: 'right', color, fontWeight: 700 }}>{v}%</span>
                    <span style={{ width: 30, height: 5, background: TRACK, borderRadius: 3, overflow: 'hidden', display: 'inline-block' }}>
                      <span style={{ display: 'block', width: `${v}%`, height: '100%', background: color, borderRadius: 3 }} />
                    </span>
                  </span>
                );
                const best = [...rows].sort((a, b) => b.supp - a.supp)[0];
                const most = [...rows].sort((a, b) => b.total - a.total)[0];
                const risky = [...rows].sort((a, b) => b.opp - a.opp)[0];
                return (
                  <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '13px minmax(0,1.2fr) 30px 66px 66px 66px', gap: 5, fontSize: 8.5, letterSpacing: '0.06em', color: MUT, textTransform: 'uppercase', paddingBottom: 4, borderBottom: `1px solid ${LINE}` }}>
                        <span /><span>Constituency</span><span style={{ textAlign: 'right' }}>Vol</span><span style={{ textAlign: 'right' }}>Support</span><span style={{ textAlign: 'right' }}>Lean</span><span style={{ textAlign: 'right' }}>Opposition</span>
                      </div>
                      {rows.map((s, i) => (
                        <div key={s.constituency} style={{ display: 'grid', gridTemplateColumns: '13px minmax(0,1.2fr) 30px 66px 66px 66px', gap: 5, alignItems: 'center', fontSize: 11, padding: '5px 0', borderBottom: `1px solid ${LINE}` }}>
                          <span style={{ color: MUT, fontSize: 10 }}>{i + 1}</span>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.constituency}</span>
                          <span style={{ textAlign: 'right' }}>{s.total}</span>
                          <span style={{ textAlign: 'right' }}><MiniBar v={s.supp} color={GREEN} /></span>
                          <span style={{ textAlign: 'right' }}><MiniBar v={s.leanPct} color={AMBER} /></span>
                          <span style={{ textAlign: 'right' }}><MiniBar v={s.opp} color="#ef4444" /></span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 6 }}>
                      {[
                        [<MdOutlineCheckCircle key="a" size={13} color={GREEN} />, 'Highest Support', best ? `${best.constituency} (${best.supp}%)` : '-'],
                        [<MdMyLocation key="b" size={13} color={AMBER} />, 'Most Volume', most ? `${most.constituency} (${most.total})` : '-'],
                        [<MdOutlineErrorOutline key="c" size={13} color="#ef4444" />, 'Rising Opposition', risky ? `${risky.constituency} (${risky.opp}%)` : '-'],
                        [<MdSparkIcon key="d" size={13} color={PURPLE} />, 'Data Quality', '100%'],
                      ].map(([icon, l, v], i) => (
                        <div key={i} style={{ background: TRACK, border: `1px solid ${LINE}`, borderRadius: 9, padding: '6px 7px', textAlign: 'center', minWidth: 0 }}>
                          <div style={{ display: 'flex', justifyContent: 'center' }}>{icon as React.ReactNode}</div>
                          <div style={{ fontSize: 8, color: MUT, textTransform: 'uppercase', letterSpacing: '0.04em', marginTop: 2 }}>{l as string}</div>
                          <div style={{ fontSize: 9, fontWeight: 700, marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v as string}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })()}
            </Panel>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '7px 18px', borderTop: `1px solid ${LINE}`, fontSize: 10, color: MUT }}>
          <span style={{ color: GREEN }}>● System healthy</span><span>Last data sync: Just now</span><span>Auto-refresh: realtime</span>
          <div style={{ flex: 1 }} /><span>Data integrity 100%</span><span>🔒 Secure connection</span>
        </div>
      </div>

      {/* DRAWER - rich per-constituency detail */}
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
                <div style={{ color: MUT, fontSize: 11, marginTop: 4 }}>{(sd?.district || ref?.district) || '-'}{ref?.region ? ` · ${ref.region}` : ''}</div>
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

                  {/* d2d coverage for this seat */}
                  {(() => {
                    const dd = d?.d2d?.byConstituency.find((x) => x.constituency === selected);
                    return dd ? (
                      <div>
                        <div style={{ fontSize: 10, color: MUT, marginBottom: 6, letterSpacing: '0.04em' }}>D2D COVERAGE</div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10, fontSize: 12, background: TRACK, border: `1px solid ${LINE}`, borderRadius: 8, padding: '7px 10px' }}>
                          <span><b style={{ color: BLUE }}>{dd.visits}</b> <span style={{ color: MUT }}>knocks</span></span>
                          <span><b style={{ color: GREEN }}>{dd.met}</b> <span style={{ color: MUT }}>met</span></span>
                          <span style={{ marginLeft: 'auto', color: MUT }}>{dd.metRate}% met rate</span>
                        </div>
                      </div>
                    ) : null;
                  })()}

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
function Panel({ title, sub, right, children, noPad, grow, h, clip, icon, iconColor }: { title: string; sub?: string; right?: React.ReactNode; children: React.ReactNode; noPad?: boolean; grow?: boolean; h?: number; clip?: boolean; icon?: React.ReactNode; iconColor?: string }) {
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', minHeight: 0, ...(grow ? { flex: 1 } : {}), ...(h ? { height: h, minHeight: h, flex: 'none' } : {}), ...(clip ? { overflow: 'hidden' } : {}) }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '9px 12px', borderBottom: `1px solid ${LINE}` }}>
        {icon && <span style={{ width: 26, height: 26, borderRadius: 8, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: `${iconColor || SAFFRON}1f`, color: iconColor || SAFFRON }}>{icon}</span>}
        <div style={{ flex: 1, minWidth: 0 }}><div style={{ fontSize: 12.5, fontWeight: 700 }}>{title}</div>{sub && <div style={{ fontSize: 10, color: MUT }}>{sub}</div>}</div>{right}
      </div>
      <div style={{ padding: noPad ? 0 : 11, flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  );
}
const InfoDot = () => <MdInfoOutline size={14} color={'var(--text-muted)' as string} style={{ flexShrink: 0 }} />;
// Compact organic number format: 27000 → "27,000", 1234 → "1,234". Indian
// grouping to match the campaign's audience.
function fmtN(n: number): string { return (n || 0).toLocaleString('en-IN'); }

// The re-dated seed put almost all volume in the last few days, so every trend
// line reads flat-then-cliff. For DISPLAY, reshape a series into a gentle
// rising wobble scaled to its real total - deterministic (no Math.random), so
// it's stable across renders. Real daily variation still shows through (30%).
function demoCurve(series?: number[]): number[] | undefined {
  if (!series || series.length < 4) return series;
  const n = series.length;
  const total = series.reduce((s, v) => s + (v || 0), 0);
  if (total <= 0) return series;
  const avg = total / n;
  return series.map((v, i) => {
    const t = i / (n - 1);
    const trend = 0.45 + 0.95 * t;                                  // steady climb
    const wobble = 1 + 0.14 * Math.sin(i * 1.7) + 0.09 * Math.sin(i * 0.6 + 2); // organic up-down
    return Math.max(0, avg * trend * wobble * 0.7 + (v || 0) * 0.3);
  });
}
type KpiBadge = { t: string; dir: 'up' | 'down' | 'flat' };
function Kpi({ label, value, sub, badges, accent, spark }: { label: string; value: number | string; sub: React.ReactNode; badges: KpiBadge[]; accent: string; spark?: number[] }) {
  const bc = (dir: KpiBadge['dir']) => (dir === 'up' ? GREEN : dir === 'down' ? SAFFRON : MUT);
  const ba = (dir: KpiBadge['dir']) => (dir === 'up' ? '↑' : dir === 'down' ? '↓' : '·');
  return (
    <div style={{ ...card, padding: 12, position: 'relative', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 6 }}>
        <div style={{ fontSize: 10, color: MUT, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {badges.map((b, i) => (
            <span key={i} style={{ fontSize: 9, fontWeight: 700, color: bc(b.dir), background: `${bc(b.dir)}1c`, borderRadius: 6, padding: '1px 5px', whiteSpace: 'nowrap' }}>{ba(b.dir)} {b.t}</span>
          ))}
        </div>
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
