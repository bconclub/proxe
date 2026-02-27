'use client'

import { useState } from 'react'
import {
  MdAdd,
  MdPlayArrow,
  MdPause,
  MdEmail,
  MdTimer,
  MdCallSplit,
  MdMoreVert,
} from 'react-icons/md'
import { FaWhatsapp } from 'react-icons/fa'

// Placeholder sequence data for the scaffold
const SAMPLE_SEQUENCES = [
  {
    id: '1',
    name: 'Post-Booking Reminder',
    description: '30 min before a booked call — WhatsApp + Email reminder',
    status: 'active' as const,
    steps: 3,
    enrolled: 0,
    completed: 0,
  },
  {
    id: '2',
    name: 'New Lead Nurture',
    description: 'Welcome sequence for new web leads — 3 touchpoints over 7 days',
    status: 'draft' as const,
    steps: 5,
    enrolled: 0,
    completed: 0,
  },
  {
    id: '3',
    name: 'No-Show Follow Up',
    description: 'Re-engage leads who missed their booked call',
    status: 'paused' as const,
    steps: 2,
    enrolled: 0,
    completed: 0,
  },
]

const statusConfig = {
  active: { label: 'Active', bg: 'bg-green-500/10', text: 'text-green-500', dot: 'bg-green-500' },
  draft: { label: 'Draft', bg: 'bg-gray-500/10', text: 'text-gray-400', dot: 'bg-gray-400' },
  paused: { label: 'Paused', bg: 'bg-yellow-500/10', text: 'text-yellow-500', dot: 'bg-yellow-500' },
}

export default function SequencesPage() {
  const [sequences] = useState(SAMPLE_SEQUENCES)

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Sequences
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Automated follow-up sequences for leads — email, WhatsApp, and timed triggers
          </p>
        </div>
        <button
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-white transition-opacity hover:opacity-85"
          style={{ backgroundColor: 'var(--primary-color)' }}
          disabled
        >
          <MdAdd size={18} />
          New Sequence
        </button>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Sequences', value: sequences.length, sub: `${sequences.filter(s => s.status === 'active').length} active` },
          { label: 'Leads in Sequence', value: 0, sub: 'Currently enrolled' },
          { label: 'Completed', value: 0, sub: 'All time' },
          { label: 'Messages Sent', value: 0, sub: 'Across all sequences' },
        ].map((stat) => (
          <div
            key={stat.label}
            className="rounded-lg border p-4"
            style={{
              backgroundColor: 'var(--dark-surface)',
              borderColor: 'var(--border-light)',
            }}
          >
            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: 'var(--text-muted)' }}>
              {stat.label}
            </p>
            <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
              {stat.value}
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>
              {stat.sub}
            </p>
          </div>
        ))}
      </div>

      {/* Sequences List */}
      <div className="space-y-3">
        {sequences.map((seq) => {
          const status = statusConfig[seq.status]
          return (
            <div
              key={seq.id}
              className="rounded-lg border p-5 transition-colors cursor-pointer"
              style={{
                backgroundColor: 'var(--dark-surface)',
                borderColor: 'var(--border-light)',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
                      {seq.name}
                    </h3>
                    <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider ${status.bg} ${status.text}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${status.dot}`} />
                      {status.label}
                    </span>
                  </div>
                  <p className="text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                    {seq.description}
                  </p>

                  {/* Step Preview */}
                  <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--text-muted)' }}>
                    <span className="flex items-center gap-1">
                      <MdCallSplit size={14} />
                      {seq.steps} steps
                    </span>
                    <span style={{ color: 'var(--border-medium)' }}>|</span>
                    <span className="flex items-center gap-1">
                      <FaWhatsapp size={12} className="text-green-500" />
                      WhatsApp
                    </span>
                    <span style={{ color: 'var(--border-medium)' }}>|</span>
                    <span className="flex items-center gap-1">
                      <MdEmail size={14} />
                      Email
                    </span>
                    <span style={{ color: 'var(--border-medium)' }}>|</span>
                    <span className="flex items-center gap-1">
                      <MdTimer size={14} />
                      Timed delays
                    </span>
                  </div>
                </div>

                {/* Right side actions */}
                <div className="flex items-center gap-3 ml-4">
                  <div className="text-right mr-4">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {seq.enrolled}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      Enrolled
                    </p>
                  </div>
                  <div className="text-right mr-4">
                    <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {seq.completed}
                    </p>
                    <p className="text-[10px] uppercase tracking-wider" style={{ color: 'var(--text-muted)' }}>
                      Completed
                    </p>
                  </div>
                  <button
                    className="p-2 rounded-lg transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    disabled
                  >
                    {seq.status === 'active' ? <MdPause size={20} /> : <MdPlayArrow size={20} />}
                  </button>
                  <button
                    className="p-2 rounded-lg transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    disabled
                  >
                    <MdMoreVert size={20} />
                  </button>
                </div>
              </div>
            </div>
          )
        })}
      </div>

      {/* Bottom Info */}
      <div
        className="rounded-lg border p-4 text-center"
        style={{
          backgroundColor: 'var(--dark-surface)',
          borderColor: 'var(--border-light)',
        }}
      >
        <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Sequence builder coming soon — create automated follow-up flows with WhatsApp, email, delays, and conditional logic.
        </p>
      </div>
    </div>
  )
}
