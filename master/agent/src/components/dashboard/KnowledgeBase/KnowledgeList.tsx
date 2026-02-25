'use client'

import { MdStorage } from 'react-icons/md'
import KnowledgeItem from './KnowledgeItem'
import type { KnowledgeBaseItem } from '@/types'

interface KnowledgeListProps {
  items: KnowledgeBaseItem[]
  loading: boolean
  error: string | null
  onDelete: (id: string) => void
}

export default function KnowledgeList({ items, loading, error, onDelete }: KnowledgeListProps) {
  if (loading) {
    return (
      <div className="text-center py-12">
        <div
          className="w-8 h-8 border-2 rounded-full animate-spin mx-auto mb-3"
          style={{ borderColor: 'var(--border-primary)', borderTopColor: 'var(--accent-primary)' }}
        />
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Loading knowledge base...
        </p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="text-center py-12">
        <p className="text-sm" style={{ color: '#EF4444' }}>
          Failed to load: {error}
        </p>
      </div>
    )
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-12">
        <MdStorage size={48} className="mx-auto mb-3" style={{ color: 'var(--text-secondary)', opacity: 0.5 }} />
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          No knowledge base items yet
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          Upload a file, add a URL, or enter text to get started.
        </p>
      </div>
    )
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full">
        <thead>
          <tr className="border-b" style={{ borderColor: 'var(--border-primary)' }}>
            {['Type', 'Title', 'Source', 'Status', 'Created', 'Actions'].map((header) => (
              <th
                key={header}
                className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider"
                style={{ color: 'var(--text-secondary)' }}
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <KnowledgeItem key={item.id} item={item} onDelete={onDelete} />
          ))}
        </tbody>
      </table>
    </div>
  )
}
