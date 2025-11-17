'use client'

import { useState, useEffect } from 'react'
import { formatDateTime } from '@/lib/utils'

const STATUS_OPTIONS = [
  'New Lead',
  'Follow Up',
  'RNR (No Response)',
  'Interested',
  'Wrong Enquiry',
  'Call Booked',
  'Closed'
]

const getStatusColor = (status: string | null) => {
  const statusColors: Record<string, { bg: string; text: string }> = {
    'New Lead': { bg: 'bg-blue-100 dark:bg-blue-900', text: 'text-blue-800 dark:text-blue-200' },
    'Follow Up': { bg: 'bg-yellow-100 dark:bg-yellow-900', text: 'text-yellow-800 dark:text-yellow-200' },
    'RNR (No Response)': { bg: 'bg-gray-100 dark:bg-gray-900', text: 'text-gray-800 dark:text-gray-200' },
    'Interested': { bg: 'bg-green-100 dark:bg-green-900', text: 'text-green-800 dark:text-green-200' },
    'Wrong Enquiry': { bg: 'bg-red-100 dark:bg-red-900', text: 'text-red-800 dark:text-red-200' },
    'Call Booked': { bg: 'bg-purple-100 dark:bg-purple-900', text: 'text-purple-800 dark:text-purple-200' },
    'Closed': { bg: 'bg-slate-100 dark:bg-slate-900', text: 'text-slate-800 dark:text-slate-200' },
  }
  return statusColors[status || 'New Lead'] || statusColors['New Lead']
}

interface Lead {
  id: string
  name: string | null
  email: string | null
  phone: string | null
  source: string | null
  timestamp: string
  status: string | null
  booking_date: string | null
  booking_time: string | null
  metadata?: any
}

interface LeadDetailsModalProps {
  lead: Lead | null
  isOpen: boolean
  onClose: () => void
  onStatusUpdate: (leadId: string, newStatus: string) => Promise<void>
}

export default function LeadDetailsModal({ lead, isOpen, onClose, onStatusUpdate }: LeadDetailsModalProps) {
  const [selectedStatus, setSelectedStatus] = useState<string>(lead?.status || 'New Lead')
  const [updatingStatus, setUpdatingStatus] = useState(false)

  // Update selected status when lead changes
  useEffect(() => {
    if (lead) {
      setSelectedStatus(lead.status || 'New Lead')
    }
  }, [lead])

  if (!isOpen || !lead) return null

  const handleStatusUpdate = async () => {
    if (selectedStatus === lead.status) return
    
    setUpdatingStatus(true)
    try {
      await onStatusUpdate(lead.id, selectedStatus)
    } catch (error) {
      console.error('Error updating status:', error)
    } finally {
      setUpdatingStatus(false)
    }
  }

  const handleCall = () => {
    if (lead.phone) {
      window.location.href = `tel:${lead.phone}`
    }
  }

  const handleWhatsApp = () => {
    if (lead.phone) {
      // Remove any non-digit characters for WhatsApp
      const phoneNumber = lead.phone.replace(/\D/g, '')
      // Open WhatsApp with the phone number
      window.open(`https://wa.me/${phoneNumber}`, '_blank')
    }
  }

  const conversationSummary = lead.metadata?.conversation_summary || lead.metadata?.summary || 'No summary available'

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose}></div>
      
      {/* Modal */}
      <div className="fixed inset-0 z-50 overflow-y-auto flex items-center justify-center p-4" onClick={onClose}>
        <div 
          className="relative w-full max-w-2xl bg-white dark:bg-[#1A1A1A] rounded-lg shadow-xl z-50"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-[#262626]">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">Lead Details</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Content */}
          <div className="p-6 space-y-6">
            {/* Contact Information */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Contact Information</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Name</label>
                  <p className="text-gray-900 dark:text-white">{lead.name || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</label>
                  <p className="text-gray-900 dark:text-white">{lead.email || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Phone</label>
                  <p className="text-gray-900 dark:text-white">{lead.phone || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Source</label>
                  <p className="text-gray-900 dark:text-white capitalize">{lead.source || '-'}</p>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Date</label>
                  <p className="text-gray-900 dark:text-white">{formatDateTime(lead.timestamp)}</p>
                </div>
                {lead.booking_date && (
                  <div>
                    <label className="text-sm font-medium text-gray-500 dark:text-gray-400">Booking</label>
                    <p className="text-gray-900 dark:text-white">
                      {lead.booking_date} {lead.booking_time ? `at ${lead.booking_time}` : ''}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {/* Conversation Summary */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Conversation Summary</h3>
              <div className="bg-gray-50 dark:bg-[#0D0D0D] rounded-lg p-4">
                <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">{conversationSummary}</p>
              </div>
            </div>

            {/* Status Update */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Status</h3>
              <div className="flex items-center gap-4">
                <div className="flex-1">
                  <select
                    value={selectedStatus}
                    onChange={(e) => setSelectedStatus(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 dark:border-[#262626] bg-white dark:bg-[#0D0D0D] text-gray-900 dark:text-white rounded-md"
                  >
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={handleStatusUpdate}
                  disabled={updatingStatus || selectedStatus === lead.status}
                  className="px-6 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-md transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                  style={{ backgroundColor: '#5B1A8C' }}
                >
                  {updatingStatus ? 'Updating...' : 'Update Status'}
                </button>
                <div className={`px-3 py-1 rounded-full text-xs font-semibold ${
                  getStatusColor(lead.status || 'New Lead').bg
                } ${getStatusColor(lead.status || 'New Lead').text}`}>
                  Current: {lead.status || 'New Lead'}
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div>
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Actions</h3>
              <div className="flex gap-4">
                {lead.phone && (
                  <>
                    <button
                      onClick={handleCall}
                      className="flex-1 px-6 py-3 bg-green-600 hover:bg-green-700 text-white rounded-md transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z" />
                      </svg>
                      Call {lead.phone}
                    </button>
                    <button
                      onClick={handleWhatsApp}
                      className="flex-1 px-6 py-3 bg-[#25D366] hover:bg-[#20BA5A] text-white rounded-md transition-colors flex items-center justify-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
                      </svg>
                      WhatsApp {lead.phone}
                    </button>
                  </>
                )}
                {!lead.phone && (
                  <p className="text-gray-500 dark:text-gray-400">No phone number available</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}

