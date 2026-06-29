'use client'

// ─────────────────────────────────────────────────────────────────────────────
// The Brain - an interactive React Flow map of how the task worker thinks.
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
import { useState, useEffect } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { MdPsychology, MdArrowBack, MdSend, MdCheckCircle, MdErrorOutline, MdWhatsapp } from 'react-icons/md'

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
      {data.tag && <div style={{ fontSize: 9.5, fontWeight: 800, letterSpacing: '.5px', color: t.accent, marginBottom: 3 }}>{data.tag}</div>}
      <div style={{ fontSize: 13, fontWeight: 700, lineHeight: 1.25 }}>{data.title}</div>
      {data.detail && <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.35 }}>{data.detail}</div>}
      <Handle type="source" position={Position.Bottom} style={{ opacity: 0 }} />
    </div>
  )
}

const nodeTypes = { brain: BrainNode }

const N = (id: string, kind: string, x: number, y: number, title: string, detail?: string, tag?: string): Node => ({
  id, type: 'brain', position: { x, y }, data: { kind, title, detail, tag },
})

const NODES: Node[] = [
  // ── main lifecycle spine (center lane) ──
  N('lead', 'entry', 520, 0, 'New lead arrives', 'WhatsApp, web, Meta form, or call', 'TRIGGER'),
  N('understand', 'stage', 520, 110, 'Understand', 'Name, business, the campaign or ad they came from, their own words', 'STEP 1'),
  N('score', 'stage', 520, 230, 'Score 0 to 100', 'AI signals 60%, activity 25%, readiness 15%, plus business boosts', 'STEP 2'),
  N('temp', 'decision', 520, 350, 'Read temperature', 'From what they say and how fast they reply', 'DECISION'),
  // temperature outcomes (horizontal fan)
  N('hot', 'hot', 180, 490, 'HOT', '"how much", "asap", "sign me up". Day 1 / 2 / 3, push', 'FAST'),
  N('warm', 'warm', 405, 490, 'WARM', '"tell me more", detail questions. Day 1 / 3 / 5', 'STANDARD'),
  N('cool', 'cool', 630, 490, 'COOL', '"maybe later", short replies. Day 2 / 5 / 8, nurture', 'STRETCHED'),
  N('cold', 'cold', 855, 490, 'COLD', '"not interested", "stop". Sequence stops, monthly re-engage', 'PARK'),
  // rejoin spine
  N('personalize', 'stage', 520, 630, 'Personalize', 'Claude writes it: real first name and the right "AI ..." interest', 'STEP 3'),
  N('time', 'stage', 520, 750, 'Time it', 'Their active hours, read receipts, quiet hours 9pm to 9am', 'STEP 4'),
  N('send', 'stage', 520, 870, 'Send', 'Approval gated, no em dashes, logged to the chat', 'STEP 5'),
  N('learn', 'loop', 520, 990, 'Learn', 'Read and reply patterns feed the next decision, then it starts over', 'LOOP'),

  // ── nudge branch (left lane, self-contained) ──
  N('quiet', 'decision', -160, 350, 'When they go quiet', 'Check the last message read receipt', 'BRANCH'),
  N('q_read', 'outcome', -160, 490, 'Read, no reply', 'Nudge 30 min after they read it'),
  N('q_deliv', 'outcome', -160, 590, 'Delivered, not read', 'Wait, reschedule to their active hour'),
  N('q_reply', 'outcome', -160, 690, 'Replied', 'Skip the nudge, the human or agent takes over'),

  // ── objection branch (right lane, self-contained) ──
  N('obj', 'decision', 1200, 350, 'When they push back', 'Detect the objection type', 'BRANCH'),
  N('a_price', 'angle', 1200, 490, 'Price', 'Value angle: 3x return in month one'),
  N('a_time', 'angle', 1200, 590, 'Timing', 'Cost of delay: leads slipping every week'),
  N('a_trust', 'angle', 1200, 690, 'Trust', 'Proof: a similar business, 2x in 30 days'),
  N('a_auth', 'angle', 1200, 790, 'Authority', 'Bring the team onto a quick call'),
  N('a_need', 'angle', 1200, 890, 'Need', 'Free audit, show the leads they are missing'),
]

const E = (s: string, t: string, opts: Partial<Edge> = {}): Edge => ({
  id: `${s}-${t}`, source: s, target: t,
  markerEnd: { type: MarkerType.ArrowClosed, color: 'var(--text-muted)' },
  style: { stroke: 'var(--text-muted)', strokeWidth: 1.5 }, ...opts,
})

const EDGES: Edge[] = [
  // main spine (top to bottom, clean)
  E('lead', 'understand'),
  E('understand', 'score'),
  E('score', 'temp'),
  // temperature fan out
  E('temp', 'hot'), E('temp', 'warm'), E('temp', 'cool'), E('temp', 'cold'),
  // rejoin (cold parks, no edge back)
  E('hot', 'personalize'), E('warm', 'personalize'), E('cool', 'personalize'),
  E('personalize', 'time'),
  E('time', 'send'),
  E('send', 'learn'),
  // nudge branch - chained so no line ever runs behind a node
  E('quiet', 'q_read'), E('q_read', 'q_deliv'), E('q_deliv', 'q_reply'),
  // objection branch - chained
  E('obj', 'a_price'), E('a_price', 'a_time'), E('a_time', 'a_trust'), E('a_trust', 'a_auth'), E('a_auth', 'a_need'),
]

// ── Stage Test Bench ─────────────────────────────────────────────────────────
// Read each engaged-journey stage exactly as it lands, and fire it to the test
// phone (your own chat) on demand. Copy lives server-side in the test-stage route
// (single source); this just renders + sends. Never touches a real lead.
type TestStage = { id: string; label: string; when: string; body: string; buttons: string[] }

function StageTestBench() {
  const [stages, setStages] = useState<TestStage[]>([])
  const [testNumber, setTestNumber] = useState('')
  const [status, setStatus] = useState<Record<string, 'idle' | 'sending' | 'sent' | 'error'>>({})
  const [errorMsg, setErrorMsg] = useState<Record<string, string>>({})

  useEffect(() => {
    fetch('/api/dashboard/brain/test-stage')
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d?.stages)) setStages(d.stages)
        if (d?.testNumber) setTestNumber(d.testNumber)
      })
      .catch(() => {})
  }, [])

  const send = async (id: string) => {
    setStatus((s) => ({ ...s, [id]: 'sending' }))
    try {
      const r = await fetch('/api/dashboard/brain/test-stage', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage: id }),
      })
      const d = await r.json()
      if (d?.success) setStatus((s) => ({ ...s, [id]: 'sent' }))
      else { setStatus((s) => ({ ...s, [id]: 'error' })); setErrorMsg((m) => ({ ...m, [id]: d?.error || 'Send failed' })) }
    } catch (e: any) {
      setStatus((s) => ({ ...s, [id]: 'error' })); setErrorMsg((m) => ({ ...m, [id]: e?.message || 'Send failed' }))
    }
  }

  if (!stages.length) return null
  return (
    <div style={{ flexShrink: 0, borderTop: '1px solid var(--border-primary)', background: 'var(--bg-secondary)', padding: '10px 16px 14px', maxHeight: '40vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 9, flexWrap: 'wrap' }}>
        <MdWhatsapp size={16} style={{ color: '#22c55e' }} />
        <span style={{ fontSize: 13, fontWeight: 800 }}>Test the engaged journey</span>
        <span style={{ fontSize: 11, color: 'var(--text-secondary)' }}>
          Fires the real message to your test number {testNumber || '…'} — your chat only, never a real lead.
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))', gap: 10 }}>
        {stages.map((s) => {
          const st = status[s.id] || 'idle'
          return (
            <div key={s.id} style={{ border: '1px solid var(--border-primary)', borderRadius: 10, padding: '10px 11px', background: 'var(--bg-primary)', display: 'flex', flexDirection: 'column', gap: 7 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-primary)' }}>{s.label}</span>
                <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{s.when}</span>
              </div>
              <div style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{s.body}</div>
              {s.buttons?.length > 0 && (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {s.buttons.map((b, i) => (
                    <span key={i} style={{ fontSize: 10, padding: '2px 8px', borderRadius: 999, border: '1px solid rgba(99,102,241,.3)', color: 'rgba(139,142,255,.95)', background: 'rgba(99,102,241,.08)' }}>{b}</span>
                  ))}
                </div>
              )}
              <button
                onClick={() => send(s.id)} disabled={st === 'sending'}
                style={{
                  marginTop: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: 12, fontWeight: 700,
                  padding: '7px 10px', borderRadius: 8, border: 'none', cursor: st === 'sending' ? 'default' : 'pointer',
                  background: st === 'sent' ? 'rgba(34,197,94,.15)' : st === 'error' ? 'rgba(239,68,68,.15)' : '#22c55e',
                  color: st === 'sent' ? '#22c55e' : st === 'error' ? '#ef4444' : '#fff', opacity: st === 'sending' ? 0.6 : 1,
                }}
              >
                {st === 'sent' ? (<><MdCheckCircle size={14} /> Sent to your WhatsApp</>)
                  : st === 'error' ? (<><MdErrorOutline size={14} /> Failed — retry</>)
                  : st === 'sending' ? ('Sending…')
                  : (<><MdSend size={13} /> Send to my WhatsApp</>)}
              </button>
              {st === 'error' && errorMsg[s.id] && (
                <div style={{ fontSize: 10, color: '#ef4444' }} title={errorMsg[s.id]}>{String(errorMsg[s.id]).slice(0, 90)}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ── Learning panel — what the brain is learning from human decisions ──────────
type LearnData = {
  total: number
  matchRate: number
  byAction: Record<string, number>
  byStageAction: Array<{ stage: string; count: number; top_action: string; top_count: number }>
  recent: Array<{ lead_id: string; lead_name: string; at: string; ai_action: string; human_action: string; matched: boolean; reason: string | null; stage: string | null; intent: string | null }>
}

function LearningPanel() {
  const [data, setData] = useState<LearnData | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    fetch('/api/dashboard/brain/decisions')
      .then((r) => r.json())
      .then((d) => { if (alive) setData(d?.error ? null : d) })
      .catch(() => {})
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [])

  return (
    <div style={{ marginTop: 24, padding: 16, border: '1px solid var(--border-primary)', borderRadius: 12, background: 'var(--bg-secondary)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
        <MdPsychology size={18} style={{ color: 'var(--accent-primary)' }} />
        <h3 style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', margin: 0 }}>What the brain is learning</h3>
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
        Every logged-call decision teaches it. When match rate climbs, the brain is ready to act on its own.
      </p>

      {loading ? (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Loading...</div>
      ) : !data || data.total === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>No decisions logged yet. Log a call and pick an action to start teaching it.</div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <Stat label="decisions" value={String(data.total)} />
            <Stat label="ai matched human" value={`${data.matchRate}%`} accent={data.matchRate >= 70 ? '#22c55e' : data.matchRate >= 40 ? '#f59e0b' : '#ef4444'} />
            <Stat label="actions used" value={String(Object.keys(data.byAction).length)} />
          </div>

          {data.byStageAction.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>patterns by stage</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {data.byStageAction.map((p) => (
                  <div key={p.stage} style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Leads at <span style={{ color: 'var(--text-primary)' }}>{p.stage}</span> → humans mostly chose <span style={{ color: 'var(--accent-primary)' }}>{p.top_action}</span> ({p.top_count}/{p.count})
                  </div>
                ))}
              </div>
            </div>
          )}

          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.4 }}>recent decisions</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {data.recent.map((e, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12, padding: '6px 8px', borderRadius: 6, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)' }}>
                <span style={{ width: 8, height: 8, borderRadius: 4, marginTop: 4, flexShrink: 0, background: e.matched ? '#22c55e' : '#f59e0b' }} />
                <div style={{ minWidth: 0 }}>
                  <div style={{ color: 'var(--text-primary)' }}>
                    {e.lead_name} · <span style={{ color: 'var(--text-secondary)' }}>{e.stage || 'unknown'}{e.intent ? ` · ${e.intent}` : ''}</span>
                  </div>
                  <div style={{ color: 'var(--text-secondary)' }}>
                    ai proposed <span style={{ color: 'var(--text-primary)' }}>{e.ai_action}</span>, human chose <span style={{ color: e.matched ? '#22c55e' : '#f59e0b' }}>{e.human_action}</span>
                    {e.reason ? ` — "${e.reason}"` : ''}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: string }) {
  return (
    <div style={{ padding: '8px 14px', borderRadius: 8, background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', minWidth: 90 }}>
      <div style={{ fontSize: 20, fontWeight: 500, color: accent || 'var(--text-primary)' }}>{value}</div>
      <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{label}</div>
    </div>
  )
}

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

        {/* Stage test bench — fire each engaged-journey message to the test phone */}
        <StageTestBench />

        {/* Learning panel — what the brain is learning from human decisions */}
        <LearningPanel />
      </div>
    </DashboardLayout>
  )
}
