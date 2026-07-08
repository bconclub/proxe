'use client'

// ─────────────────────────────────────────────────────────────────────────────
// MapView — the ENGINE MAP. How the whole POP machine is wired together:
// lead sources → MyVoice (lead-gen hub) → PROXe engine + the person spine →
// the frontline ladder (contact→voter→supporter→volunteer→cadre/KYC) → the
// artifacts (Overview / War Room / Door to Door / Pulse App), with PROXe Listen
// feeding signals and the Pulse leader app pushing directives. Live counts on
// the badges come from /api/war-room/data (intensity tiers, touchpoints, signals).
// ─────────────────────────────────────────────────────────────────────────────

import ReactFlow, {
  Background, BackgroundVariant, Controls, MiniMap, Handle, Position, MarkerType,
  useNodesState, useEdgesState,
  type Node, type Edge, type NodeProps,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useState, useEffect } from 'react'

const TONES: Record<string, { bg: string; border: string; accent: string }> = {
  entry:    { bg: 'var(--accent-subtle)',   border: 'var(--accent-primary)', accent: 'var(--accent-primary)' },
  source:   { bg: 'var(--bg-secondary)',    border: 'var(--border-primary)', accent: 'var(--text-secondary)' },
  hub:      { bg: 'rgba(240,108,24,.12)',   border: '#F06C18',               accent: '#F06C18' },
  engine:   { bg: 'rgba(168,85,247,.12)',   border: 'rgba(168,85,247,.6)',   accent: '#a855f7' },
  data:     { bg: 'rgba(45,212,191,.10)',   border: 'rgba(45,212,191,.55)',  accent: '#2dd4bf' },
  ladder:   { bg: 'rgba(56,189,248,.10)',   border: 'rgba(56,189,248,.5)',   accent: '#38bdf8' },
  gate:     { bg: 'rgba(236,72,153,.10)',   border: 'rgba(236,72,153,.5)',   accent: '#ec4899' },
  artifact: { bg: 'rgba(34,197,94,.10)',    border: 'rgba(34,197,94,.5)',    accent: '#22c55e' },
}

type BrainNodeData = { kind: string; title: string; detail?: string; tag?: string; badge?: string }

function BrainNode({ data }: NodeProps<BrainNodeData>) {
  const t = TONES[data.kind] || TONES.source
  const big = data.kind === 'hub' || data.kind === 'engine'
  return (
    <div style={{
      width: big ? 232 : 208, padding: big ? '12px 14px' : '10px 12px', borderRadius: 12, position: 'relative',
      background: t.bg, border: `1.5px solid ${t.border}`,
      boxShadow: big ? `0 6px 22px ${t.accent}22` : '0 4px 14px rgba(0,0,0,0.18)', color: 'var(--text-primary)',
    }}>
      <Handle type="target" position={Position.Top} id="t" style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} id="l" style={{ opacity: 0 }} />
      {data.badge != null && (
        <span style={{
          position: 'absolute', top: -10, right: -8, minWidth: 24, height: 22, padding: '0 8px',
          borderRadius: 999, background: t.accent, color: '#0a0a0a', fontSize: 11.5, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.35)',
        }}>{data.badge}</span>
      )}
      {data.tag && <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.5px', color: t.accent, marginBottom: 3 }}>{data.tag}</div>}
      <div style={{ fontSize: big ? 14.5 : 13, fontWeight: 800, lineHeight: 1.2 }}>{data.title}</div>
      {data.detail && <div style={{ fontSize: 10.8, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.35 }}>{data.detail}</div>}
      <Handle type="source" position={Position.Bottom} id="b" style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} id="r" style={{ opacity: 0 }} />
    </div>
  )
}

const nodeTypes = { brain: BrainNode }

const N = (id: string, kind: string, x: number, y: number, title: string, detail?: string, tag?: string): Node<BrainNodeData> => ({
  id, type: 'brain', position: { x, y }, data: { kind, title, detail, tag },
})

// colored, animated edge. r→l by default (left→right lanes); pass handles to override.
const EC = (s: string, t: string, color: string, opts: Partial<Edge> = {}): Edge => ({
  id: `${s}-${t}`, source: s, target: t, animated: true,
  sourceHandle: 'r', targetHandle: 'l',
  markerEnd: { type: MarkerType.ArrowClosed, color },
  style: { stroke: color, strokeWidth: 1.5, opacity: 0.8 },
  ...opts,
})

// edge palette by relationship
const C_INTAKE = '#F06C18', C_ENGINE = '#a855f7', C_LADDER = '#38bdf8', C_FEED = '#22c55e', C_SIGNAL = '#2dd4bf', C_DIRECTIVE = '#ec4899'

// ── lanes (x) ──  sources · MyVoice · engine/data · frontline · artifacts
// Blasted-out spacing: ~560px between lanes (nodes are ~232 wide → ~330px of
// clear gap), ~140px between rows. Nothing overlaps; every edge has open air.
const LX = { a: -1120, b: -560, c: 0, d: 560, e: 1120 }
const BASE_NODES: Node<BrainNodeData>[] = [
  // Lane A — LEAD SOURCES
  N('src_head', 'entry', LX.a, -260, 'LEAD SOURCES', 'Every way a person enters', 'INTAKE'),
  N('s_call', 'source', LX.a, -110, 'Outbound Calls', 'AI dialer reaches out'),
  N('s_wa', 'source', LX.a, 30, 'WhatsApp Campaigns', 'Broadcasts + reply capture'),
  N('s_qr', 'source', LX.a, 170, 'QR Codes', 'Posters, rallies, on-ground'),
  N('s_web', 'source', LX.a, 310, 'Web / Landing', 'Forms + web chat'),
  N('s_missed', 'source', LX.a, 450, 'Missed Call', 'Give a missed call to opt in'),
  N('s_d2d', 'ladder', LX.a, 640, 'D2D Front End', 'Volunteer field app — the front end', 'ON-GROUND'),

  // Lane B — MYVOICE (lead-gen hub)
  N('myvoice', 'hub', LX.b, 150, 'MyVoice', 'Enhanced lead-gen hub. Every channel funnels in; the voice + intent get captured.', 'LEAD GEN'),

  // Lane C — ENGINE + DATA (+ Listen, D2D back end)
  N('listen', 'data', LX.c, -260, 'PROXe Listen', 'External signals: social, news, WhatsApp, field chatter', 'SIGNALS'),
  N('engine', 'engine', LX.c, 40, 'PROXe Engine', 'The back end. Understand → score → gauge intensity → route.', 'CORE'),
  N('data', 'data', LX.c, 360, 'The Person Spine', 'One record per person, gauged on intensity 0-4. Everything reads and writes here.', 'DATA'),
  N('d2d_back', 'engine', LX.c, 640, 'D2D Back End', 'PROXe runs the back end for the field app.', 'BACK END'),

  // Lane D — THE FRONTLINE LADDER
  N('fl_head', 'ladder', LX.d, -260, 'THE FRONTLINE', 'People climb by interactions', 'LADDER'),
  N('contact', 'ladder', LX.d, -110, 'Contact', 'First touch'),
  N('voter', 'ladder', LX.d, 30, 'Identified Voter', 'Placeable — booth / seat'),
  N('supporter', 'ladder', LX.d, 170, 'Supporter', 'Earned by number of interactions'),
  N('volunteer', 'ladder', LX.d, 310, 'Volunteer', 'Opts in to act on the ground'),
  N('kyc', 'gate', LX.d, 450, 'KYC gate', 'Verify identity to promote', 'GATE'),
  N('cadre', 'ladder', LX.d, 590, 'Cadre', 'Verified core worker'),

  // Lane E — ARTIFACTS (the surfaces)
  N('art_head', 'entry', LX.e, -260, 'ARTIFACTS', 'The surfaces you work in', 'SURFACES'),
  N('overview', 'artifact', LX.e, -90, 'Overview', 'The whole engine scene — everything across artifacts and data.', 'AGGREGATE'),
  N('warroom', 'artifact', LX.e, 90, 'War Room', 'What to act on right now.', 'ACT'),
  N('d2d_art', 'artifact', LX.e, 270, 'Door to Door', "What's happening on the ground.", 'GROUND'),
  N('pulse', 'artifact', LX.e, 450, 'Pulse App', 'Leader view — pushes directives into the War Room.', 'LEADER'),
]

const BASE_EDGES: Edge[] = [
  // sources → MyVoice
  EC('s_call', 'myvoice', C_INTAKE), EC('s_wa', 'myvoice', C_INTAKE), EC('s_qr', 'myvoice', C_INTAKE),
  EC('s_web', 'myvoice', C_INTAKE), EC('s_missed', 'myvoice', C_INTAKE),
  // D2D front end → D2D back end (PROXe owns the back end)
  EC('s_d2d', 'd2d_back', C_INTAKE),
  // MyVoice → engine, and (user) MyVoice also feeds War Room + Overview
  EC('myvoice', 'engine', C_ENGINE),
  EC('myvoice', 'warroom', C_FEED, { type: 'smoothstep' }),
  EC('myvoice', 'overview', C_FEED, { type: 'smoothstep' }),
  // Listen + D2D back end → engine
  EC('listen', 'engine', C_SIGNAL), EC('d2d_back', 'engine', C_ENGINE),
  // engine → person spine
  EC('engine', 'data', C_ENGINE, { sourceHandle: 'b', targetHandle: 't' }),
  // person spine → frontline ladder
  EC('data', 'contact', C_LADDER),
  // ladder progression (vertical)
  EC('contact', 'voter', C_LADDER, { sourceHandle: 'b', targetHandle: 't' }),
  EC('voter', 'supporter', C_LADDER, { sourceHandle: 'b', targetHandle: 't' }),
  EC('supporter', 'volunteer', C_LADDER, { sourceHandle: 'b', targetHandle: 't' }),
  EC('volunteer', 'kyc', C_LADDER, { sourceHandle: 'b', targetHandle: 't' }),
  EC('kyc', 'cadre', C_LADDER, { sourceHandle: 'b', targetHandle: 't' }),
  // person spine + engine → artifacts
  EC('data', 'warroom', C_FEED), EC('data', 'd2d_art', C_FEED), EC('data', 'overview', C_FEED),
  EC('engine', 'overview', C_FEED, { type: 'smoothstep' }),
  // Listen → War Room (crisis) + Overview
  EC('listen', 'warroom', C_SIGNAL, { type: 'smoothstep' }),
  // frontline (cadre) do the ground work → Door to Door
  EC('cadre', 'd2d_art', C_LADDER, { type: 'smoothstep' }),
  // Pulse leader app → War Room (directives)
  EC('pulse', 'warroom', C_DIRECTIVE, { sourceHandle: 't', targetHandle: 'b', type: 'smoothstep' }),
  // War Room rolls up into Overview
  EC('warroom', 'overview', C_FEED, { sourceHandle: 't', targetHandle: 'b', type: 'smoothstep' }),
]

type WR = {
  kpis?: { total?: number; raised?: number };
  intensity?: { tiers?: number[] } | null;
  listen?: { totals?: { signals7d?: number } } | null;
  recommendations?: any[] | null;
}
const fmtK = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10000 ? 0 : 1)}k` : String(n))

const LEGEND: { c: string; label: string }[] = [
  { c: C_INTAKE, label: 'Intake' },
  { c: C_ENGINE, label: 'Engine' },
  { c: C_LADDER, label: 'Frontline' },
  { c: C_SIGNAL, label: 'Signals' },
  { c: C_FEED, label: 'Feeds artifacts' },
  { c: C_DIRECTIVE, label: 'Directives' },
]

export default function MapView() {
  const [nodes, setNodes, onNodesChange] = useNodesState(BASE_NODES)
  const [edges, , onEdgesChange] = useEdgesState(BASE_EDGES)
  const [loadedLive, setLoadedLive] = useState(false)

  // Live counts → badges (intensity tiers, touchpoints, signals). Graceful degrade.
  useEffect(() => {
    fetch('/api/war-room/data')
      .then((r) => (r.ok ? r.json() : null))
      .then((d: WR | null) => {
        if (!d) return
        const tiers = d.intensity?.tiers || []
        const badge: Record<string, string> = {}
        if (tiers.length >= 5) {
          badge.contact = fmtK(tiers[0]); badge.voter = fmtK(tiers[1]); badge.supporter = fmtK(tiers[2])
          badge.volunteer = fmtK(tiers[3]); badge.cadre = fmtK(tiers[4])
        }
        if (d.kpis?.total != null) { badge.myvoice = fmtK(d.kpis.total); badge.data = fmtK(d.kpis.total) }
        if (d.listen?.totals?.signals7d != null) badge.listen = fmtK(d.listen.totals.signals7d)
        if (d.recommendations && d.recommendations.length) badge.pulse = String(d.recommendations.length)
        if (d.kpis?.raised != null) badge.warroom = `${fmtK(d.kpis.raised)} open`
        if (Object.keys(badge).length === 0) return
        setNodes((prev) => prev.map((n) => (badge[n.id] != null ? { ...n, data: { ...n.data, badge: badge[n.id] } } : n)))
        setLoadedLive(true)
      })
      .catch(() => {})
  }, [setNodes])

  return (
    <div style={{ height: '100%', borderTop: '1px solid var(--border-primary)', position: 'relative' }}>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        fitView fitViewOptions={{ padding: 0.14 }} minZoom={0.2} maxZoom={1.6}
        proOptions={{ hideAttribution: true }}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
      >
        <Background variant={BackgroundVariant.Dots} gap={22} size={1} color="var(--border-primary)" />
        <Controls showInteractive={false} />
        <MiniMap
          pannable zoomable
          nodeColor={(n) => (TONES[(n.data as any)?.kind]?.accent) || 'var(--text-muted)'}
          maskColor="rgba(0,0,0,0.35)"
          style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}
        />
      </ReactFlow>
      {/* caption + legend */}
      <div style={{ position: 'absolute', top: 10, left: 12, fontSize: 10.5, color: 'var(--text-muted)', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '5px 10px', maxWidth: 340 }}>
        {loadedLive ? 'Live counts on the badges · ' : ''}How the whole engine is wired — sources feed MyVoice, PROXe gauges every person, the frontline climbs, the artifacts surface it.
      </div>
      <div style={{ position: 'absolute', bottom: 12, left: 12, display: 'flex', flexWrap: 'wrap', gap: 10, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '7px 11px' }}>
        {LEGEND.map((l) => (
          <span key={l.label} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 10.5, color: 'var(--text-secondary)' }}>
            <span style={{ width: 14, height: 3, borderRadius: 2, background: l.c, display: 'inline-block' }} />{l.label}
          </span>
        ))}
      </div>
    </div>
  )
}
