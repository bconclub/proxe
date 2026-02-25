'use client'

import { useState, useEffect, useCallback } from 'react'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import { FileUploader, UrlInput, TextInput, KnowledgeList } from '@/components/dashboard/KnowledgeBase'
import { MdCloudUpload, MdLink, MdTextSnippet } from 'react-icons/md'
import type { KnowledgeBaseItem } from '@/types'

type Tab = 'upload' | 'url' | 'text'

const TABS: { id: Tab; label: string; icon: typeof MdCloudUpload }[] = [
  { id: 'upload', label: 'Upload Files', icon: MdCloudUpload },
  { id: 'url', label: 'Add URL', icon: MdLink },
  { id: 'text', label: 'Enter Text', icon: MdTextSnippet },
]

export default function KnowledgeBaseClient() {
  const [items, setItems] = useState<KnowledgeBaseItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState<Tab>('upload')

  const fetchItems = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch('/api/knowledge-base')
      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || 'Failed to fetch')
      }
      const data = await res.json()
      setItems(data.data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchItems()
  }, [fetchItems])

  const handleDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/knowledge-base/${id}`, { method: 'DELETE' })
      if (res.ok) {
        // Optimistic removal
        setItems((prev) => prev.filter((item) => item.id !== id))
      } else {
        const err = await res.json()
        alert(err.error || 'Failed to delete item')
      }
    } catch {
      alert('Network error. Please try again.')
    }
  }

  // Stats
  const readyCount = items.filter((i) => i.embeddings_status === 'ready').length
  const pendingCount = items.filter((i) => i.embeddings_status === 'pending' || i.embeddings_status === 'processing').length
  const errorCount = items.filter((i) => i.embeddings_status === 'error').length

  return (
    <DashboardLayout>
      <div className="p-6 max-w-5xl">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Knowledge Base
          </h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
            Add content that your AI agent uses to answer customer questions.
          </p>
        </div>

        {/* Stats Bar */}
        {items.length > 0 && (
          <div className="flex gap-4 mb-6">
            <div
              className="flex-1 p-4 rounded-lg"
              style={{ background: 'var(--bg-secondary)' }}
            >
              <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                {items.length}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Total Items</p>
            </div>
            <div
              className="flex-1 p-4 rounded-lg"
              style={{ background: 'var(--bg-secondary)' }}
            >
              <p className="text-2xl font-bold" style={{ color: '#22C55E' }}>
                {readyCount}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Ready</p>
            </div>
            <div
              className="flex-1 p-4 rounded-lg"
              style={{ background: 'var(--bg-secondary)' }}
            >
              <p className="text-2xl font-bold" style={{ color: '#3B82F6' }}>
                {pendingCount}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Pending</p>
            </div>
            {errorCount > 0 && (
              <div
                className="flex-1 p-4 rounded-lg"
                style={{ background: 'var(--bg-secondary)' }}
              >
                <p className="text-2xl font-bold" style={{ color: '#EF4444' }}>
                  {errorCount}
                </p>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>Errors</p>
              </div>
            )}
          </div>
        )}

        {/* Add Content Section */}
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Add Content
          </h2>

          <div className="p-6 rounded-lg" style={{ background: 'var(--bg-secondary)' }}>
            {/* Tab Switcher */}
            <div className="flex gap-2 mb-6">
              {TABS.map((tab) => {
                const Icon = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{
                      backgroundColor: activeTab === tab.id ? 'var(--accent-primary)' : 'var(--bg-tertiary)',
                      color: activeTab === tab.id ? 'white' : 'var(--text-secondary)',
                    }}
                  >
                    <Icon size={16} />
                    {tab.label}
                  </button>
                )
              })}
            </div>

            {/* Active Tab Content */}
            {activeTab === 'upload' && <FileUploader onUploadComplete={fetchItems} />}
            {activeTab === 'url' && <UrlInput onSubmit={fetchItems} />}
            {activeTab === 'text' && <TextInput onSubmit={fetchItems} />}
          </div>
        </div>

        {/* Knowledge Items Table */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
              Your Knowledge
              {!loading && (
                <span className="text-sm font-normal ml-2" style={{ color: 'var(--text-secondary)' }}>
                  ({items.length} {items.length === 1 ? 'item' : 'items'})
                </span>
              )}
            </h2>
            {items.length > 0 && (
              <button
                onClick={fetchItems}
                className="text-xs px-3 py-1.5 rounded-lg transition-colors"
                style={{ background: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }}
              >
                Refresh
              </button>
            )}
          </div>

          <div className="rounded-lg overflow-hidden" style={{ background: 'var(--bg-secondary)' }}>
            <KnowledgeList
              items={items}
              loading={loading}
              error={error}
              onDelete={handleDelete}
            />
          </div>
        </div>
      </div>
    </DashboardLayout>
  )
}
