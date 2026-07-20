'use client'

/**
 * KnowledgeGraphSection - the "highlight" at the top of the Knowledge Base page.
 * Fetches the read-only inventory (/api/knowledge-base/graph) and renders the
 * Obsidian-style map + a legend + a click-to-view side panel. View-only: prompts
 * are surfaced here; the "Open editor" link jumps to the page that owns them.
 */

import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { MdClose, MdOpenInNew, MdAutoAwesome } from 'react-icons/md'
import KnowledgeGraph, { type GraphNode, type GraphLink, type GraphGroup } from './KnowledgeGraph'

interface GraphPayload {
  brand: { id: string; name: string }
  counts: { knowledge: number; prompts: number; templates: number }
  nodes: GraphNode[]
  links: GraphLink[]
}

const LEGEND: { group: GraphGroup; label: string; color: string }[] = [
  { group: 'knowledge', label: 'Knowledge', color: '#A3E635' },
  { group: 'prompts', label: 'Prompts', color: '#60A5FA' },
  { group: 'voice', label: 'Voice', color: '#F472B6' },
  { group: 'brain', label: 'Brain', color: '#C084FC' },
  { group: 'channels', label: 'Channels', color: '#FBBF24' },
  { group: 'templates', label: 'Templates', color: '#34D399' },
]

export default function KnowledgeGraphSection() {
  const [data, setData] = useState<GraphPayload | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<GraphNode | null>(null)

  useEffect(() => {
    let alive = true
    ;(async () => {
      try {
        setLoading(true)
        const res = await fetch('/api/knowledge-base/graph')
        if (!res.ok) throw new Error('Failed to load knowledge map')
        const json = (await res.json()) as GraphPayload
        if (alive) setData(json)
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Unknown error')
      } finally {
        if (alive) setLoading(false)
      }
    })()
    return () => { alive = false }
  }, [])

  const counts = data?.counts
  const nodeCount = useMemo(
    () => (data ? data.nodes.filter((n) => n.kind === 'leaf').length : 0),
    [data],
  )

  return (
    <div className="mb-10">
      <div className="flex items-center gap-2 mb-1">
        <MdAutoAwesome size={20} style={{ color: '#A3E635' }} />
        <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
          Everything your agent knows
        </h2>
      </div>
      <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
        One map of every knowledge source and prompt driving your AI. Drag nodes, scroll to zoom, click any node to read it.
      </p>

      {/* Counts */}
      {counts && (
        <div className="flex flex-wrap gap-3 mb-4">
          <CountPill value={counts.knowledge} label="knowledge docs" color="#A3E635" />
          <CountPill value={counts.prompts} label="prompts" color="#60A5FA" />
          <CountPill value={counts.templates} label="templates" color="#34D399" />
          <CountPill value={nodeCount} label="total nodes" color="var(--text-secondary)" />
        </div>
      )}

      <div className="relative">
        {loading && (
          <div className="w-full rounded-xl flex items-center justify-center"
            style={{ height: 460, background: 'var(--bg-secondary)', color: 'var(--text-secondary)' }}>
            Mapping your knowledge…
          </div>
        )}
        {error && !loading && (
          <div className="w-full rounded-xl flex items-center justify-center text-sm"
            style={{ height: 200, background: 'var(--bg-secondary)', color: '#EF4444' }}>
            {error}
          </div>
        )}
        {!loading && !error && data && (
          <>
            <KnowledgeGraph
              nodes={data.nodes}
              links={data.links}
              onSelect={setSelected}
              selectedId={selected?.id}
            />

            {/* Legend */}
            <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3">
              {LEGEND.map((l) => (
                <span key={l.group} className="flex items-center gap-1.5 text-xs" style={{ color: 'var(--text-secondary)' }}>
                  <span className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: l.color }} />
                  {l.label}
                </span>
              ))}
            </div>

            {/* Side panel */}
            {selected && selected.kind === 'leaf' && (
              <div
                className="absolute top-0 right-0 h-full w-full sm:w-[380px] p-5 overflow-y-auto rounded-xl"
                style={{
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-color, rgba(148,163,184,0.2))',
                  boxShadow: '-8px 0 24px rgba(0,0,0,0.25)',
                }}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div>
                    <h3 className="text-base font-semibold leading-snug" style={{ color: 'var(--text-primary)' }}>
                      {selected.label}
                    </h3>
                    {selected.meta && (
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>{selected.meta}</p>
                    )}
                  </div>
                  <button onClick={() => setSelected(null)} className="shrink-0 p-1 rounded" style={{ color: 'var(--text-secondary)' }}>
                    <MdClose size={18} />
                  </button>
                </div>

                <div className="flex flex-wrap gap-2 mb-3">
                  {typeof selected.chars === 'number' && (
                    <Badge>{selected.chars.toLocaleString()} chars</Badge>
                  )}
                  {selected.overridden && <Badge color="#60A5FA">Custom override</Badge>}
                  {selected.status && <Badge color={selected.status === 'ready' ? '#22C55E' : '#FBBF24'}>{selected.status}</Badge>}
                </div>

                {selected.content ? (
                  <pre
                    className="text-xs whitespace-pre-wrap break-words rounded-lg p-3 mb-4"
                    style={{ background: 'var(--bg-secondary)', color: 'var(--text-primary)', maxHeight: 320, overflow: 'auto', fontFamily: 'ui-monospace, monospace' }}
                  >
                    {selected.content}
                  </pre>
                ) : (
                  <p className="text-xs mb-4" style={{ color: 'var(--text-secondary)' }}>No preview available.</p>
                )}

                {selected.editHref && (
                  <Link
                    href={selected.editHref}
                    className="inline-flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg font-medium"
                    style={{ background: 'var(--button-bg)', color: 'var(--text-button)' }}
                  >
                    <MdOpenInNew size={15} />
                    Open editor
                  </Link>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

function CountPill({ value, label, color }: { value: number; label: string; color: string }) {
  return (
    <div className="px-3 py-2 rounded-lg flex items-baseline gap-1.5" style={{ background: 'var(--bg-secondary)' }}>
      <span className="text-lg font-bold" style={{ color }}>{value}</span>
      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{label}</span>
    </div>
  )
}

function Badge({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="text-[11px] px-2 py-0.5 rounded-full"
      style={{ background: 'var(--bg-secondary)', color: color || 'var(--text-secondary)', border: `1px solid ${color || 'var(--border-color, rgba(148,163,184,0.2))'}` }}
    >
      {children}
    </span>
  )
}
