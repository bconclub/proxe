'use client'

import { useState } from 'react'
import { MdPictureAsPdf, MdLink, MdTextSnippet, MdDescription, MdDelete } from 'react-icons/md'
import type { KnowledgeBaseItem as KBItem } from '@/types'

interface KnowledgeItemProps {
  item: KBItem
  onDelete: (id: string) => void
}

const TYPE_CONFIG: Record<string, { icon: typeof MdPictureAsPdf; label: string; color: string }> = {
  pdf: { icon: MdPictureAsPdf, label: 'PDF', color: '#EF4444' },
  doc: { icon: MdDescription, label: 'DOC', color: '#3B82F6' },
  url: { icon: MdLink, label: 'URL', color: '#8B5CF6' },
  text: { icon: MdTextSnippet, label: 'Text', color: '#22C55E' },
}

const STATUS_CONFIG: Record<string, { label: string; bg: string; color: string; pulse?: boolean }> = {
  pending: { label: 'Pending', bg: 'rgba(59, 130, 246, 0.1)', color: '#3B82F6' },
  processing: { label: 'Processing', bg: 'rgba(245, 158, 11, 0.1)', color: '#F59E0B', pulse: true },
  ready: { label: 'Ready', bg: 'rgba(34, 197, 94, 0.1)', color: '#22C55E' },
  error: { label: 'Error', bg: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' },
}

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHrs = Math.floor(diffMs / 3600000)
  const diffDays = Math.floor(diffMs / 86400000)

  if (diffMins < 1) return 'Just now'
  if (diffMins < 60) return `${diffMins}m ago`
  if (diffHrs < 24) return `${diffHrs}h ago`
  if (diffDays < 7) return `${diffDays}d ago`
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function KnowledgeItem({ item, onDelete }: KnowledgeItemProps) {
  const [deleting, setDeleting] = useState(false)

  const typeConfig = TYPE_CONFIG[item.type] || TYPE_CONFIG.text
  const statusConfig = STATUS_CONFIG[item.embeddings_status] || STATUS_CONFIG.pending
  const TypeIcon = typeConfig.icon

  const handleDelete = async () => {
    setDeleting(true)
    await onDelete(item.id)
    setDeleting(false)
  }

  const source = item.source_url || item.file_name || '—'

  return (
    <tr
      className="border-b transition-colors"
      style={{ borderColor: 'var(--border-primary)' }}
    >
      {/* Type */}
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: `${typeConfig.color}15` }}
          >
            <TypeIcon size={18} style={{ color: typeConfig.color }} />
          </div>
          <span className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            {typeConfig.label}
          </span>
        </div>
      </td>

      {/* Title */}
      <td className="px-4 py-3">
        <p className="text-sm font-medium truncate max-w-[200px]" style={{ color: 'var(--text-primary)' }}>
          {item.title}
        </p>
        {item.content && (
          <p className="text-xs truncate max-w-[200px] mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {item.content.substring(0, 80)}...
          </p>
        )}
      </td>

      {/* Source */}
      <td className="px-4 py-3">
        <p className="text-xs truncate max-w-[180px]" style={{ color: 'var(--text-secondary)' }}>
          {source}
        </p>
        {item.file_size && (
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
            {formatFileSize(item.file_size)}
          </p>
        )}
      </td>

      {/* Status */}
      <td className="px-4 py-3">
        <span
          className={`inline-flex items-center text-xs px-2.5 py-1 rounded-full font-medium ${statusConfig.pulse ? 'animate-pulse' : ''}`}
          style={{ background: statusConfig.bg, color: statusConfig.color }}
        >
          {statusConfig.label}
        </span>
        {item.error_message && item.embeddings_status === 'error' && (
          <p className="text-xs mt-1 truncate max-w-[120px]" style={{ color: '#EF4444' }}>
            {item.error_message}
          </p>
        )}
      </td>

      {/* Created */}
      <td className="px-4 py-3">
        <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
          {formatDate(item.created_at)}
        </span>
      </td>

      {/* Actions */}
      <td className="px-4 py-3">
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="p-2 rounded-lg transition-colors hover:bg-red-500/10 disabled:opacity-50"
          title="Delete item"
        >
          <MdDelete size={18} style={{ color: deleting ? 'var(--text-secondary)' : '#EF4444' }} />
        </button>
      </td>
    </tr>
  )
}
