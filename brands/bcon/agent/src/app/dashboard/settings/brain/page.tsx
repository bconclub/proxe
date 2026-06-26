'use client'

// ─────────────────────────────────────────────────────────────────────────────
// The Brain — an interactive React Flow map of how the task worker thinks.
// Pan / zoom / drag / click. Each node is a real step in the live logic
// (task-worker.js + engine.ts): understand -> score -> temperature -> branch ->
// personalize -> time -> send -> learn, with the objection and nudge branches.
// ─────────────────────────────────────────────────────────────────────────────

import ReactFlow, {
  Background, BackgroundVariant, Controls, MiniMap, Handle, Position, MarkerType,
  useNodesState, useEdgesState,
  type Node, type Edge, type NodeProps,
} from 'reactflow'
import 'reactflow/dist/style.css'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { MdPsychology, MdArrowBack } from 'react-icons/md'

// ── tone palette (maps to the dashboard's CSS variables + temperature colors) ──
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
}

function BrainNode({ data }: NodeProps<{ kind: string; title: string; detail?: string; tag?: string }>) {
  const t = TONES[data.kind] || TONES.stage
  return (
    <div style={{
      width: 208, padding: '10px 12px', borderRadius: 12,
      background: t.bg, border: `1.5px solid ${t.border}`,
      boxShadow: '0 4px 14px rgba(0,0,0,0.18)', color: 'var(--text-primary)',
    }}>
      <Handle type="target" position={Position.Top} style={{ opacity: 0 }} />
      <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />
      {data.tag && <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.5px', color: t.accent, marginBottom: 3 }}>{data.tag}</div>}
      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{data.title}</div>
      {data.detail && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.35 }}>{data.detail}</div>}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
      <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
    </div>
  )
}

const nodeTypes = { brain: BrainNode }

const N = (id: string, kind: string, x: number, y: number, title: string, detail?: string, tag?: string): Node => ({
  id, type: 'brain', position: { x, y }, data: { kind, title, detail, tag },
})

const NODES: Node[] = [
  // ── main lifecycle spine (center) ──
  N('lead', 'entry', 400, 0, 'New lead arrives', 'WhatsApp, web, Meta form, or call', 'TRIGGER'),
  N('understand', 'stage', 400, 120, 'Understand', 'Name, business, the campaign/ad they came from, their own words', 'STEP 1'),
  N('score', 'stage', 400, 250, 'Score 0–100', 'AI signals 60% · Activity 25% · Readiness 15% · business boosts', 'STEP 2'),
  N('temp', 'decision', 400, 380, 'Read temperature', 'From what they say + how fast they reply', 'DECISION'),
  // temperature outcomes
  N('hot', 'hot', 70, 530, 'HOT', '"how much", "asap", "sign me up" → Day 1 / 2 / 3, push', 'FAST'),
  N('warm', 'warm', 300, 530, 'WARM', '"tell me more", detail questions → Day 1 / 3 / 5', 'STANDARD'),
  N('cool', 'cool', 530, 530, 'COOL', '"maybe later", short replies → Day 2 / 5 / 8, nurture', 'STRETCHED'),
  N('cold', 'cold', 760, 530, 'COLD', '"not interested", "stop" → sequence stops, monthly re-engage', 'PARK'),
  // rejoin
  N('personalize', 'stage', 400, 690, 'Personalize', 'Claude writes the message — real first name + the right "AI …" interest', 'STEP 3'),
  N('time', 'stage', 400, 820, 'Time it', 'Their active hours · read receipts · quiet hours 9pm–9am', 'STEP 4'),
  N('send', 'stage', 400, 950, 'Send', 'Approval-gated, no em dashes, logged to the chat', 'STEP 5'),
  N('learn', 'loop', 400, 1080, 'Learn', 'Read / reply patterns feed the next decision', 'LOOP ↻'),

  // ── objection branch (right) ──
  N('obj', 'decision', 760, 690, 'They push back?', 'Detect the objection type', 'BRANCH'),
  N('a_price', 'angle', 760, 800, 'Price', 'Value angle — 3x return in month one'),
  N('a_time', 'angle', 760, 872, 'Timing', 'Cost of delay — leads slipping every week'),
  N('a_trust', 'angle', 760, 944, 'Trust', 'Proof — similar business, 2x in 30 days'),
  N('a_auth', 'angle', 760, 1016, 'Authority', 'Bring the team onto a quick call'),
  N('a_need', 'angle', 760, 1088, 'Need', 'Free audit — show the leads they’re missing'),

  // ── nudge branch (left) ──
  N('quiet', 'decision', 40, 690, 'They go quiet?', 'Check the last message’s read receipt', 'BRANCH'),
  N('q_read', 'outcome', 40, 800, 'Read, no reply', 'Nudge 30 min after they read it'),
  N('q_deliv', 'outcome', 40, 880, 'Delivered, not read', 'Wait — reschedule to their active hour'),
  N('q_reply', 'outcome', 40, 960, 'Replied', 'Skip the nudge — human/agent takes over'),
]

const E = (s: string, t: string, opts: Partial<Edge> = {}): Edge => ({
  id: `${s}-${t}`, source: s, target: t,
  markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--text-muted)' },
  style: { stroke: 'var(--text-muted)', strokeWidth: 1.5 }, ...opts,
})

const EDGES: Edge[] = [
  E('lead', 'understand'),
  E('understand', 'score'),
  E('score', 'temp'),
  E('temp', 'hot'), E('temp', 'warm'), E('temp', 'cool'), E('temp', 'cold'),
  E('hot', 'personalize'), E('warm', 'personalize'), E('cool', 'personalize'),
  E('personalize', 'time'),
  E('time', 'send'),
  E('send', 'learn'),
  E('learn', 'understand', { animated: true, style: { stroke: 'var(--accent-primary)', strokeWidth: 1.5, strokeDasharray: '5 5' }, markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--accent-primary)' } }),
  // objection branch
  E('score', 'obj', { style: { stroke: '#f59e0b', strokeWidth: 1.4 } }),
  E('obj', 'a_price'), E('obj', 'a_time'), E('obj', 'a_trust'), E('obj', 'a_auth'), E('obj', 'a_need'),
  // nudge branch
  E('understand', 'quiet', { style: { stroke: '#f59e0b', strokeWidth: 1.4 } }),
  E('quiet', 'q_read'), E('quiet', 'q_deliv'), E('quiet', 'q_reply'),
]

export default function BrainPage() {
  const [nodes, , onNodesChange] = useNodesState(NODES)
  const [edges, , onEdgesChange] = useEdgesState(EDGES)

  return (
    <DashboardLayout>
      <div style={{ height: 'calc(100vh - 3rem)', display: 'flex', flexDirection: 'column', color: 'var(--text-primary)' }}>
        {/* Header */}
        <div style={{ padding: '14px 20px 10px', flexShrink: 0 }}>
          <a href="/dashboard/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 12.5, color: 'var(--text-secondary)', textDecoration: 'none', marginBottom: 8 }}>
            <MdArrowBack size={15} /> Configure
          </a>
          <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
            <span style={{ width: 38, height: 38, borderRadius: 11, background: 'var(--accent-subtle)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <MdPsychology size={22} />
            </span>
            <div>
              <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800 }}>The Brain</h1>
              <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>
                How the task worker thinks on every lead. Drag, zoom, and follow the flow. Runs every 5 minutes, approval-gated.
              </p>
            </div>
          </div>
        </div>

        {/* Flow canvas */}
        <div style={{ flex: 1, minHeight: 0, borderTop: '1px solid var(--border-primary)' }}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: 0.15 }}
            minZoom={0.3}
            maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
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
        </div>
      </div>
    </DashboardLayout>
  )
}
