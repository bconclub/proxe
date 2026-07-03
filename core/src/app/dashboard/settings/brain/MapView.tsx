'use client'

// ─────────────────────────────────────────────────────────────────────────────
// MapView — how PROXe actually thinks, drawn from the REAL wiring:
// sources → welcome-per-source → understand → score → temperature (live counts)
// → personalize → gates → send → learn-loop, plus the real ladders (ghost
// ONE_TOUCH, RNR, low-touch, booking) with the exact template each step fires,
// and the nudge read-receipt branch. Live badges come from /brain/overview.
// ─────────────────────────────────────────────────────────────────────────────

import ReactFlow, {
  Background, BackgroundVariant, Controls, MiniMap, Handle, Position, MarkerType,
  useNodesState, useEdgesState,
  type Node, type Edge, type NodeProps,
} from 'reactflow'
import 'reactflow/dist/style.css'
import { useState, useEffect } from 'react'

const TONES: Record<string, { bg: string; border: string; accent: string }> = {
  entry:    { bg: 'var(--accent-subtle)', border: 'var(--accent-primary)', accent: 'var(--accent-primary)' },
  stage:    { bg: 'var(--bg-secondary)',  border: 'var(--border-primary)', accent: 'var(--text-secondary)' },
  decision: { bg: 'var(--bg-secondary)',  border: '#f59e0b',               accent: '#f59e0b' },
  hot:      { bg: 'rgba(239,68,68,.10)',  border: 'rgba(239,68,68,.55)',   accent: '#ef4444' },
  warm:     { bg: 'rgba(245,158,11,.10)', border: 'rgba(245,158,11,.55)',  accent: '#f59e0b' },
  cool:     { bg: 'rgba(59,130,246,.10)', border: 'rgba(59,130,246,.55)',  accent: '#3b82f6' },
  cold:     { bg: 'rgba(148,163,184,.12)',border: 'rgba(148,163,184,.5)',  accent: '#94a3b8' },
  angle:    { bg: 'rgba(168,85,247,.10)', border: 'rgba(168,85,247,.5)',   accent: '#a855f7' },
  outcome:  { bg: 'rgba(34,197,94,.10)',  border: 'rgba(34,197,94,.5)',    accent: '#22c55e' },
  loop:     { bg: 'var(--bg-tertiary)',   border: 'var(--accent-primary)', accent: 'var(--accent-primary)' },
  gate:     { bg: 'rgba(236,72,153,.08)', border: 'rgba(236,72,153,.45)',  accent: '#ec4899' },
  ladder:   { bg: 'rgba(56,189,248,.08)', border: 'rgba(56,189,248,.45)',  accent: '#38bdf8' },
}

type BrainNodeData = { kind: string; title: string; detail?: string; tag?: string; tmpl?: string; badge?: string }

function BrainNode({ data }: NodeProps<BrainNodeData>) {
  const t = TONES[data.kind] || TONES.stage
  return (
    <div style={{
      width: 212, padding: '10px 12px', borderRadius: 12, position: 'relative',
      background: t.bg, border: `1.5px solid ${t.border}`,
      boxShadow: '0 4px 14px rgba(0,0,0,0.18)', color: 'var(--text-primary)',
      backdropFilter: 'blur(6px)',
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} id="l" style={{ opacity: 0 }} />
      {data.badge != null && (
        <span style={{
          position: 'absolute', top: -10, right: -8, minWidth: 24, height: 22, padding: '0 7px',
          borderRadius: 999, background: t.accent, color: '#0a0a0a', fontSize: 11.5, fontWeight: 800,
          display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 2px 8px rgba(0,0,0,.35)',
        }}>{data.badge}</span>
      )}
      {data.tag && <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.5px', color: t.accent, marginBottom: 3 }}>{data.tag}</div>}
      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{data.title}</div>
      {data.detail && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.35 }}>{data.detail}</div>}
      {data.tmpl && (
        <div style={{ fontSize: 9.5, marginTop: 5, fontFamily: 'ui-monospace, monospace', color: t.accent, opacity: 0.9, wordBreak: 'break-all' }}>
          {data.tmpl}
        </div>
      )}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} id="r" style={{ opacity: 0 }} />
    </div>
  )
}

const nodeTypes = { brain: BrainNode }

const N = (id: string, kind: string, x: number, y: number, title: string, detail?: string, tag?: string, tmpl?: string): Node<BrainNodeData> => ({
  id, type: 'brain', position: { x, y }, data: { kind, title, detail, tag, tmpl },
})

const E = (s: string, t: string, opts: Partial<Edge> = {}): Edge => ({
  id: `${s}-${t}`, source: s, target: t, animated: true,
  markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--text-muted)' },
  style: { stroke: 'var(--text-muted)', strokeWidth: 1.4, opacity: 0.75 }, ...opts,
})

const BASE_NODES: Node<BrainNodeData>[] = [
  // ── Lane 0: SOURCES + welcome per source ──
  N('src_head', 'entry', -560, -60, 'WHERE LEADS ARRIVE', 'Each source fires its own first message', 'INTAKE'),
  N('src_form', 'stage', -560, 60, 'Website form', 'Their interest + message + company fill the welcome', undefined, 'bcon_welcome_web_v1'),
  N('src_chat', 'stage', -560, 190, 'Web chat', 'Welcome deferred until they state a goal', undefined, 'bcon_welcome_web_v1'),
  N('src_meta', 'stage', -560, 320, 'Meta — AI Lead Machine', 'first_outreach task via the worker', undefined, 'bcon_lead_machine_meta_welcome_v1_'),
  N('src_wa', 'stage', -560, 450, 'WhatsApp direct', 'Prompt v4 greeting + Explore/About/Book buttons'),
  N('src_voice', 'stage', -560, 580, 'Voice call', 'Logs the session, no WhatsApp welcome'),

  // ── Spine ──
  N('lead', 'entry', 60, 0, 'New lead lands', 'One lead per phone+brand — chat is the sole creator', 'START'),
  N('understand', 'stage', 60, 130, 'Understand', 'Name, business, campaign/ad they came from, their own words', 'STEP 1'),
  N('score', 'stage', 60, 260, 'Score 0-100', 'AI signals 60% · activity 25% · readiness 15% + business boosts', 'STEP 2'),
  N('temp', 'decision', 60, 390, 'Read temperature', 'From what they say and how fast they reply', 'DECISION'),

  // temperature fan (live badges filled at runtime)
  N('hot', 'hot', -290, 540, 'HOT · 70+', '"how much", "asap". Cadence Day 1 / 2 / 3, push to book', 'FAST'),
  N('warm', 'warm', -50, 540, 'WARM · 40-69', '"tell me more". Cadence Day 1 / 3 / 5', 'STANDARD'),
  N('cool', 'cool', 190, 540, 'COOL · <40', '"maybe later". Cadence Day 2 / 5 / 8, nurture', 'STRETCHED'),
  N('cold', 'cold', 430, 540, 'COLD / STOP', 'Sequence stops. Monthly re-engage only', 'PARK'),

  N('personalize', 'stage', 60, 690, 'Personalize', 'Sonnet writes it: real first name + the right "AI ..." interest', 'STEP 3'),
  N('gates', 'gate', 60, 820, 'THE GATES', 'Approval · quiet hours 9pm-9am · 24h window · reply kill-switch · STOP · no double-enrol', 'EVERY SEND'),
  N('send', 'stage', 60, 965, 'Send', 'Template outside 24h window, free-form inside. Logged to the timeline', 'STEP 4'),
  N('learn', 'loop', 60, 1095, 'Learn', 'Read/reply patterns + human decisions feed the next pass. Loops forever', 'RECURSION'),

  // ── Nudge branch (left of spine, below sources) ──
  N('quiet', 'decision', -560, 720, 'Asked a question, lead quiet', 'Timer by temp: hot 1h · warm 2h · cool 3h', 'NUDGE'),
  N('q_read', 'outcome', -560, 860, 'Read, no reply', 'Nudge 30 min after the read receipt'),
  N('q_tier', 'angle', -560, 975, 'Tiered nudge', 'Tier 1 know-nothing · Tier 2 know a detail · Tier 3 form lead'),
  N('q_deliv', 'outcome', -560, 1095, 'Not read yet', 'Reschedule to their active hour'),

  // ── Ladders (right side) ──
  N('lad_head', 'ladder', 640, -60, 'THE LADDERS', 'What fires when, per situation', 'CADENCES'),

  N('ghost0', 'ladder', 640, 60, 'GHOST — never replied', 'ONE_TOUCH: exits on any reply', 'LADDER'),
  N('ghost1', 'stage', 640, 190, 'Day 1', 'What are you trying to fix?', undefined, 'bcon_onetouch_d1_v1'),
  N('ghost2', 'stage', 640, 310, 'Day 3 · Day 7', 'Still figuring it out? / Still dealing with it?', undefined, 'bcon_onetouch_d3_v1 · d7_v1'),
  N('ghost3', 'stage', 640, 430, 'Day 30 goodbye', '+ Day 90 re-engage', undefined, 'bcon_onetouch_d30_v1'),

  N('rnr0', 'ladder', 960, 60, 'RNR — call not answered', 'From the log-call note. Cancels prior ladder first', 'LADDER'),
  N('rnr1', 'stage', 960, 190, '+30 min', 'Missed-call follow-up', undefined, 'bcon_proxe_followup_noengage'),
  N('rnr2', 'stage', 960, 310, 'Day 1 · Day 3', 'Retry touches', undefined, 'bcon_proxe_followup_noengage'),
  N('rnr3', 'stage', 960, 430, 'Day 5 · Day 7', 'Re-engage pair', undefined, 'bcon_proxe_reengagement_noengage'),

  N('low0', 'ladder', 1280, 60, 'DEMO / PROPOSAL', 'Low-touch after a real conversation', 'LADDER'),
  N('low1', 'stage', 1280, 190, 'Day 1', 'Follow up on the pain they named', undefined, 'bcon_lowtouch_d1_v1'),
  N('low2', 'stage', 1280, 310, 'Day 3 · Day 5-7', 'Priority check + proof point', undefined, 'bcon_lowtouch_d3_v1 · d7_v1'),

  N('book0', 'ladder', 1600, 60, 'BOOKED — call path', 'Reminders around the scheduled call', 'LADDER'),
  N('book1', 'stage', 1600, 190, '24h · 1h · 30m before', 'Reminder trio', undefined, 'booking_reminder_24h · 30m'),
  N('book2', 'stage', 1600, 310, 'Post-call follow-up', 'Then the log-call note routes the next ladder', undefined, 'bcon_proxe_post_call_followup'),
  N('book3', 'outcome', 1600, 430, 'No-show?', 'Reroutes into the RNR ladder'),
]

const BASE_EDGES: Edge[] = [
  // sources → lead
  E('src_form', 'lead', { sourceHandle: 'r', targetHandle: 'l' }),
  E('src_chat', 'lead', { sourceHandle: 'r', targetHandle: 'l' }),
  E('src_meta', 'lead', { sourceHandle: 'r', targetHandle: 'l' }),
  E('src_wa', 'lead', { sourceHandle: 'r', targetHandle: 'l' }),
  E('src_voice', 'lead', { sourceHandle: 'r', targetHandle: 'l' }),
  E('src_head', 'src_form'),
  // spine
  E('lead', 'understand'), E('understand', 'score'), E('score', 'temp'),
  E('temp', 'hot'), E('temp', 'warm'), E('temp', 'cool'), E('temp', 'cold'),
  E('hot', 'personalize'), E('warm', 'personalize'), E('cool', 'personalize'),
  E('personalize', 'gates'), E('gates', 'send'), E('send', 'learn'),
  E('learn', 'understand', { type: 'smoothstep', style: { stroke: 'var(--accent-primary)', strokeWidth: 1.6, opacity: 0.9 }, markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--accent-primary)' } }),
  // nudge branch
  E('quiet', 'q_read'), E('q_read', 'q_tier'), E('q_tier', 'q_deliv'),
  // ladders
  E('lad_head', 'ghost0', { sourceHandle: 'r', targetHandle: 'l' }),
  E('ghost0', 'ghost1'), E('ghost1', 'ghost2'), E('ghost2', 'ghost3'),
  E('rnr0', 'rnr1'), E('rnr1', 'rnr2'), E('rnr2', 'rnr3'),
  E('low0', 'low1'), E('low1', 'low2'),
  E('book0', 'book1'), E('book1', 'book2'), E('book2', 'book3'),
  E('book3', 'rnr0', { sourceHandle: 'r', type: 'smoothstep' }),
]

type Ov = { handling_now?: { hot: number; warm: number; cold: number; active_sequences: number; queued_approvals: number }; stages?: Record<string, number> }

export default function MapView() {
  const [nodes, setNodes, onNodesChange] = useNodesState(BASE_NODES)
  const [edges, , onEdgesChange] = useEdgesState(BASE_EDGES)
  const [loadedLive, setLoadedLive] = useState(false)

  // Pull live counts once and badge the matching nodes.
  useEffect(() => {
    fetch('/api/dashboard/brain/overview')
      .then((r) => r.json())
      .then((d: Ov & { error?: string }) => {
        if (d?.error || !d?.handling_now) return
        const hn = d.handling_now
        const inSeq = d.stages?.['In Sequence'] ?? null
        setNodes((prev) => prev.map((n) => {
          if (n.id === 'hot') return { ...n, data: { ...n.data, badge: String(hn.hot) } }
          if (n.id === 'warm') return { ...n, data: { ...n.data, badge: String(hn.warm) } }
          if (n.id === 'cool') return { ...n, data: { ...n.data, badge: String(hn.cold) } }
          if (n.id === 'gates') return { ...n, data: { ...n.data, badge: `${hn.queued_approvals} waiting` } }
          if (n.id === 'lad_head' && inSeq != null) return { ...n, data: { ...n.data, badge: `${inSeq} in seq` } }
          if (n.id === 'send') return { ...n, data: { ...n.data, badge: `${hn.active_sequences} live` } }
          return n
        }))
        setLoadedLive(true)
      })
      .catch(() => {})
  }, [setNodes])

  return (
    <div style={{ height: '100%', borderTop: '1px solid var(--border-primary)', position: 'relative' }}>
      <ReactFlow
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        fitView fitViewOptions={{ padding: 0.12 }} minZoom={0.22} maxZoom={1.6}
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
      <div style={{ position: 'absolute', top: 10, left: 12, fontSize: 10.5, color: 'var(--text-muted)', background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 8, padding: '5px 10px' }}>
        {loadedLive ? 'Live counts on the badges · ' : ''}Every template name shown is the real Meta template that step fires
      </div>
    </div>
  )
}
