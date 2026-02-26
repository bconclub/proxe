'use client'

import { useState } from 'react'
import { MdAdd } from 'react-icons/md'

interface TextInputProps {
  onSubmit: () => void
}

const CATEGORIES = [
  'what_is_proxe',
  'features',
  'pricing',
  'how_it_works',
  'faq',
  'comparison',
  'philosophy',
]

export default function TextInput({ onSubmit }: TextInputProps) {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [category, setCategory] = useState('')
  const [subcategory, setSubcategory] = useState('')
  const [tagsInput, setTagsInput] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    setSuccess(false)

    if (!question.trim()) {
      setError('Question is required')
      return
    }
    if (!answer.trim()) {
      setError('Answer is required')
      return
    }

    setSubmitting(true)

    const tags = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0)

    try {
      const res = await fetch('/api/knowledge-base/text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: question.trim(),
          answer: answer.trim(),
          category: category || null,
          subcategory: subcategory.trim() || null,
          tags,
        }),
      })

      if (!res.ok) {
        const err = await res.json()
        setError(err.error || 'Failed to save')
        return
      }

      setQuestion('')
      setAnswer('')
      setCategory('')
      setSubcategory('')
      setTagsInput('')
      setSuccess(true)
      onSubmit()
      setTimeout(() => setSuccess(false), 2000)
    } catch {
      setError('Network error. Please try again.')
    } finally {
      setSubmitting(false)
    }
  }

  const inputStyle = {
    background: 'var(--bg-tertiary)',
    color: 'var(--text-primary)',
    border: '1px solid var(--border-primary)',
  }

  return (
    <form onSubmit={handleSubmit}>
      <div className="space-y-4">
        {/* Question */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Question
          </label>
          <input
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="e.g., How much does it cost?"
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
        </div>

        {/* Answer */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Answer
          </label>
          <textarea
            value={answer}
            onChange={(e) => setAnswer(e.target.value)}
            placeholder="The complete answer your AI agent should give..."
            rows={5}
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none resize-y"
            style={inputStyle}
          />
          {answer.length > 0 && (
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              {answer.length.toLocaleString()} characters
            </p>
          )}
        </div>

        {/* Category + Subcategory */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Category
            </label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
              style={inputStyle}
            >
              <option value="">Select category...</option>
              {CATEGORIES.map(cat => (
                <option key={cat} value={cat}>{cat.replace(/_/g, ' ')}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
              Subcategory
            </label>
            <input
              type="text"
              value={subcategory}
              onChange={(e) => setSubcategory(e.target.value)}
              placeholder="e.g., plans, setup, speed"
              className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
              style={inputStyle}
            />
          </div>
        </div>

        {/* Tags */}
        <div>
          <label className="block text-xs font-medium mb-1.5" style={{ color: 'var(--text-secondary)' }}>
            Tags <span style={{ color: 'var(--text-tertiary)' }}>(comma-separated)</span>
          </label>
          <input
            type="text"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
            placeholder="pricing, cost, plans, subscription"
            className="w-full px-4 py-2.5 rounded-lg text-sm outline-none"
            style={inputStyle}
          />
        </div>

        {/* Submit */}
        <button
          type="submit"
          disabled={submitting || !question.trim() || !answer.trim()}
          className="flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium text-white transition-opacity disabled:opacity-50"
          style={{ background: 'var(--accent-primary)' }}
        >
          <MdAdd size={18} />
          {submitting ? 'Saving...' : 'Add Q&A Entry'}
        </button>

        {error && (
          <div
            className="p-3 rounded-lg text-sm"
            style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444', border: '1px solid rgba(239, 68, 68, 0.3)' }}
          >
            {error}
          </div>
        )}

        {success && (
          <div
            className="p-3 rounded-lg text-sm"
            style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}
          >
            Q&A entry saved successfully!
          </div>
        )}
      </div>
    </form>
  )
}
