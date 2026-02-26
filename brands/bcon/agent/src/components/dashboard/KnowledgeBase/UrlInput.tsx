'use client'

import { useState } from 'react'
import { MdLink, MdAdd } from 'react-icons/md'

interface UrlInputProps {
  onSubmit: () => void
}

export default function UrlInput({ onSubmit }: UrlInputProps) {
  const [url, setUrl] = useState('')
  const [title, setTitle] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!url.trim()) {
      setError('URL is required')
      return
    }

    // Basic URL validation
    try {
      new URL(url.trim())
    } catch {
      setError('Please enter a valid URL (e.g., https://example.com)')
      return
    }

    setSubmitting(true)

    try {
      const res = await fetch('/api/knowledge-base/url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          url: url.trim(),
          title: title.trim() || undefined,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        setError(err.error || 'Failed to add URL')
        return
      }

      setUrl('')
      setTitle('')
      setSuccess(true)
      onSubmit()
      setTimeout(() => setSuccess(false), 2000)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        {/* URL Input */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Website URL
          </label>
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <MdLink
                size={18}
                className="absolute left-3 top-1/2 -translate-y-1/2"
                style={{ color: 'var(--text-secondary)' }}
              />
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/page"
                className="w-full pl-9 pr-4 py-2.5 rounded-lg text-sm outline-none"
                style={{
                  background: 'var(--bg-tertiary)',
                  color: 'var(--text-primary)',
                  border: '1px solid var(--border-primary)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Optional Title */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Title (optional — auto-generated from URL if blank)
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g., Company FAQ Page"
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
            style={{
              background: 'var(--bg-tertiary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
            }}
          />
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={submitting || !url.trim()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
          style={{ background: 'var(--accent-primary)' }}
        >
          <MdAdd size={18} />
          {submitting ? 'Adding...' : 'Add URL'}
        </button>

        {/* Error */}
        {error && (
          <div
            className="p-3 rounded-lg text-sm"
            style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}
          >
            {error}
          </div>
        )}

        {/* Success */}
        {success && (
          <div
            className="p-3 rounded-lg text-sm"
            style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}
          >
            URL added successfully!
          </div>
        )}
      </div>
    </form>
  )
}
