'use client'

import { useState, useRef, useCallback } from 'react'
import { MdCloudUpload, MdInsertDriveFile, MdClose } from 'react-icons/md'

interface FileUploaderProps {
  onUploadComplete: () => void
}

const ACCEPTED_TYPES = '.pdf,.doc,.docx,.txt'
const ACCEPTED_MIME = [
  'application/pdf',
  'text/plain',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]

export default function FileUploader({ onUploadComplete }: FileUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ name: string; status: 'uploading' | 'done' | 'error'; error?: string }[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)

    const files = Array.from(e.dataTransfer.files).filter(
      (f) => ACCEPTED_MIME.includes(f.type) || f.name.endsWith('.txt')
    )
    if (files.length > 0) {
      await uploadFiles(files)
    }
  }, [])

  const handleFileSelect = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : []
    if (files.length > 0) {
      await uploadFiles(files)
    }
    // Reset input so same file can be re-selected
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }, [])

  const uploadFiles = async (files: File[]) => {
    setUploading(true)
    const progress = files.map((f) => ({ name: f.name, status: 'uploading' as const }))
    setUploadProgress(progress)

    for (let i = 0; i < files.length; i++) {
      const file = files[i]
      try {
        const formData = new FormData()
        formData.append('file', file)

        const res = await fetch('/api/knowledge-base/upload', {
          method: 'POST',
          body: formData,
        })

        if (!res.ok) {
          const err = await res.json()
          setUploadProgress((prev) =>
            prev.map((p, idx) =>
              idx === i ? { ...p, status: 'error', error: err.error || 'Upload failed' } : p
            )
          )
        } else {
          setUploadProgress((prev) =>
            prev.map((p, idx) => (idx === i ? { ...p, status: 'done' } : p))
          )
        }
      } catch {
        setUploadProgress((prev) =>
          prev.map((p, idx) =>
            idx === i ? { ...p, status: 'error', error: 'Network error' } : p
          )
        )
      }
    }

    setUploading(false)
    onUploadComplete()

    // Clear progress after 3 seconds
    setTimeout(() => setUploadProgress([]), 3000)
  }

  return (
    <div>
      {/* Drop Zone */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
        className="relative cursor-pointer rounded-lg border-2 border-dashed p-8 text-center transition-all"
        style={{
          borderColor: isDragOver ? 'var(--accent-primary)' : 'var(--border-primary)',
          background: isDragOver ? 'var(--accent-subtle)' : 'var(--bg-tertiary)',
        }}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        <MdCloudUpload
          size={48}
          style={{ color: isDragOver ? 'var(--accent-primary)' : 'var(--text-secondary)' }}
          className="mx-auto mb-3"
        />

        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {isDragOver ? 'Drop files here' : 'Drag & drop files here, or click to browse'}
        </p>
        <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
          Supports PDF, DOC, DOCX, TXT (max 10MB)
        </p>
      </div>

      {/* Upload Progress */}
      {uploadProgress.length > 0 && (
        <div className="mt-4 space-y-2">
          {uploadProgress.map((item, idx) => (
            <div
              key={idx}
              className="flex items-center gap-3 p-3 rounded-lg"
              style={{ background: 'var(--bg-tertiary)' }}
            >
              <MdInsertDriveFile size={20} style={{ color: 'var(--text-secondary)' }} />
              <span className="flex-1 text-sm truncate" style={{ color: 'var(--text-primary)' }}>
                {item.name}
              </span>
              {item.status === 'uploading' && (
                <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'var(--accent-subtle)', color: 'var(--accent-primary)' }}>
                  Uploading...
                </span>
              )}
              {item.status === 'done' && (
                <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22C55E' }}>
                  Done
                </span>
              )}
              {item.status === 'error' && (
                <span className="text-xs px-2 py-1 rounded-full" style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }}>
                  {item.error || 'Error'}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
