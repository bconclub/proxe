'use client'

import { useState, useRef, useCallback, useEffect } from 'react'
import { MdClose, MdImage, MdAutoAwesome, MdPersonAdd, MdArrowBack, MdArrowForward } from 'react-icons/md'
import { FaWhatsapp } from 'react-icons/fa'
import { getCurrentBrandId } from '@/configs'

interface AddLeadModalProps {
  isOpen: boolean
  onClose: () => void
  onCreated?: () => void
}

const COURSE_OPTIONS = ['DGCA', 'Flight', 'Heli', 'Cabin', 'Drone']
const USER_TYPE_OPTIONS = [
  { value: 'student', label: 'Student' },
  { value: 'parent', label: 'Parent' },
  { value: 'professional', label: 'Professional' },
]

// Agency-business intake (bcon live behavior; pop is a bcon clone and shares it)
const SERVICE_OPTIONS = [
  'AI Brand Audit',
  'Lead Automation',
  'Marketing / Ads',
  'Website / Funnel',
  'AI Agent / Chatbot',
  'Other',
]
const URGENCY_OPTIONS = [
  { value: 'asap', label: 'ASAP' },
  { value: '1-3mo', label: '1-3 months' },
  { value: '3-6mo', label: '3-6 months' },
  { value: 'exploring', label: 'Just exploring' },
]

const inputClass =
  'w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-[#262626] text-gray-900 dark:text-white placeholder-gray-400 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-50'
const labelClass = 'block text-sm font-medium mb-1.5'

export default function AddLeadModal({ isOpen, onClose, onCreated }: AddLeadModalProps) {
  const brandId = getCurrentBrandId()
  const showAviationFields = brandId === 'windchasers'
  // bcon (and its clone pop) capture agency-business intake instead of the
  // course/education fields, and have no welcome-message checkbox.
  const showAgencyFields = ['bcon', 'pop'].includes(brandId)

  const [step, setStep] = useState<1 | 2>(1)
  const [name, setName] = useState('')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [city, setCity] = useState('')
  const [courseInterest, setCourseInterest] = useState('')
  const [userType, setUserType] = useState('')
  const [education, setEducation] = useState('')
  const [businessName, setBusinessName] = useState('')
  const [businessType, setBusinessType] = useState('')
  const [serviceInterest, setServiceInterest] = useState('')
  const [websiteStatus, setWebsiteStatus] = useState('')
  const [leadVolume, setLeadVolume] = useState('')
  const [urgency, setUrgency] = useState('')
  const [note, setNote] = useState('')
  const [sendWelcome, setSendWelcome] = useState(false)

  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [extracting, setExtracting] = useState(false)
  const [extractMsg, setExtractMsg] = useState<string | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const resetForm = useCallback(() => {
    setStep(1)
    setName(''); setPhone(''); setEmail(''); setCity('')
    setCourseInterest(''); setUserType(''); setEducation('')
    setBusinessName(''); setBusinessType(''); setServiceInterest('')
    setWebsiteStatus(''); setLeadVolume(''); setUrgency(''); setNote('')
    setSendWelcome(false)
    setImagePreview(null); setExtractMsg(null); setError(null)
  }, [])

  const handleClose = useCallback(() => {
    if (saving || extracting) return
    resetForm()
    onClose()
  }, [saving, extracting, resetForm, onClose])

  // ── Screenshot → extract ────────────────────────────────────────────────
  const runExtraction = useCallback(async (dataUrl: string) => {
    setExtracting(true)
    setError(null)
    setExtractMsg(null)
    try {
      const res = await fetch('/api/dashboard/leads/extract-screenshot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ image: dataUrl }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Could not read the screenshot')

      const ex = data.extracted || {}
      // Only fill fields the operator hasn't already typed — never clobber input.
      if (ex.name) setName((p) => p || ex.name)
      if (ex.phone) setPhone((p) => p || ex.phone)
      if (ex.email) setEmail((p) => p || ex.email)
      if (ex.city) setCity((p) => p || ex.city)
      if (showAgencyFields) {
        if (ex.business_name) setBusinessName((p) => p || ex.business_name)
        if (ex.business_type) setBusinessType((p) => p || ex.business_type)
        if (ex.service_interest) setServiceInterest((p) => p || ex.service_interest)
        if (ex.website_status) setWebsiteStatus((p) => p || ex.website_status)
        if (ex.lead_volume) setLeadVolume((p) => p || ex.lead_volume)
        if (ex.urgency) setUrgency((p) => p || ex.urgency)
        if (ex.summary) setNote((p) => p || ex.summary)
      } else {
        if (ex.education) setEducation((p) => p || ex.education)
        const noteBits = [ex.summary, ex.interest ? `Interested in: ${ex.interest}` : null].filter(Boolean)
        if (noteBits.length) setNote((p) => p || noteBits.join('\n'))
      }

      const foundKeys = showAgencyFields
        ? ['name', 'phone', 'email', 'city', 'business_name', 'business_type', 'service_interest']
        : ['name', 'phone', 'email', 'city', 'education']
      const found = foundKeys.filter((k) => ex[k]).length
      setExtractMsg(
        found > 0
          ? `Read ${found} field${found > 1 ? 's' : ''} from the screenshot. Review before saving.`
          : 'Couldn’t pull clear details — please fill them in manually.',
      )
    } catch (err: any) {
      setError(err?.message || 'Failed to read the screenshot')
    } finally {
      setExtracting(false)
    }
  }, [showAgencyFields])

  const handleFile = useCallback((file: File | null | undefined) => {
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Please drop an image file (PNG, JPG, WebP).')
      return
    }
    if (file.size > 5 * 1024 * 1024) {
      setError('Image is too large. Please use a screenshot under 5MB.')
      return
    }
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      setImagePreview(dataUrl)
      runExtraction(dataUrl)
    }
    reader.readAsDataURL(file)
  }, [runExtraction])

  // Paste an image straight into the modal (Ctrl/Cmd+V) — only on the Details step.
  useEffect(() => {
    if (!isOpen || step !== 1) return
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items || []).find((i) => i.type.startsWith('image/'))
      if (item) {
        const file = item.getAsFile()
        if (file) handleFile(file)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [isOpen, step, handleFile])

  const handleSave = useCallback(async () => {
    if (!phone.trim()) {
      setError('Phone number is required')
      setStep(1)
      return
    }
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/dashboard/leads/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: name.trim(),
          phone: phone.trim(),
          email: email.trim(),
          city: city.trim(),
          note: note.trim(),
          ...(showAgencyFields
            ? {
                business_name: businessName.trim(),
                business_type: businessType.trim(),
                service_interest: serviceInterest.trim(),
                website_status: websiteStatus.trim(),
                lead_volume: leadVolume.trim(),
                urgency: urgency.trim(),
              }
            : {
                course_interest: courseInterest.trim(),
                user_type: userType.trim(),
                education: education.trim(),
                send_welcome: sendWelcome,
              }),
        }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Failed to add lead')
      // Lead saved. If a welcome was requested but failed, keep the modal open
      // and surface it — the lead is safe, only the message didn't go.
      if (sendWelcome && data.welcome_sent === false) {
        setError(`Lead saved, but the welcome message failed: ${data.welcome_error || 'unknown'}. You can message them from the inbox.`)
        setSaving(false)
        return
      }
      resetForm()
      onCreated?.()
      onClose()
    } catch (err: any) {
      setError(err?.message || 'Failed to add lead')
    } finally {
      setSaving(false)
    }
  }, [name, phone, email, city, courseInterest, userType, education, businessName, businessType, serviceInterest, websiteStatus, leadVolume, urgency, note, sendWelcome, showAgencyFields, resetForm, onCreated, onClose])

  if (!isOpen) return null

  const StepDot = ({ n, label }: { n: 1 | 2; label: string }) => (
    <div className="flex items-center gap-1.5">
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center text-[11px] font-bold"
        style={
          step === n
            ? { backgroundColor: 'var(--button-bg)', color: 'var(--text-button)' }
            : { backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)' }
        }
      >
        {n}
      </span>
      <span className="text-xs font-medium" style={{ color: step === n ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{label}</span>
    </div>
  )

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 backdrop-blur-sm z-50" onClick={handleClose} />
      <div className="fixed inset-0 z-50 overflow-y-auto flex items-start justify-center p-4 pt-12">
        <div
          className="relative w-full max-w-lg bg-white dark:bg-[#1A1A1A] rounded-lg shadow-xl z-50"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-5 border-b border-gray-200 dark:border-[#262626]">
            <div className="flex items-center gap-2">
              <MdPersonAdd size={22} style={{ color: 'var(--accent-primary)' }} />
              <h2 className="text-lg font-bold text-gray-900 dark:text-white">Add Lead</h2>
            </div>
            <button
              onClick={handleClose}
              disabled={saving || extracting}
              className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors disabled:opacity-50 rounded"
              aria-label="Close"
            >
              <MdClose size={22} />
            </button>
          </div>

          {/* Step indicator */}
          <div className="flex items-center gap-3 px-5 py-3 border-b" style={{ borderColor: 'var(--border-primary)' }}>
            <StepDot n={1} label="Details" />
            <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border-primary)' }} />
            <StepDot n={2} label={showAgencyFields ? 'Business' : 'More'} />
          </div>

          <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto">
            {/* ───────── STEP 1 — Details ───────── */}
            {step === 1 && (
              <>
                {/* Screenshot dropzone */}
                <div
                  onClick={() => !extracting && fileInputRef.current?.click()}
                  onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]) }}
                  className="cursor-pointer rounded-lg border-2 border-dashed transition-colors p-4 text-center"
                  style={{
                    borderColor: dragOver ? 'var(--accent-primary)' : 'var(--border-primary)',
                    backgroundColor: dragOver ? 'var(--accent-subtle)' : 'transparent',
                  }}
                >
                  <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleFile(e.target.files?.[0])} />
                  {imagePreview ? (
                    <div className="flex flex-col items-center gap-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={imagePreview} alt="Screenshot preview" className="max-h-32 rounded-md border" style={{ borderColor: 'var(--border-primary)' }} />
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                        {extracting ? 'Reading screenshot…' : 'Click to replace screenshot'}
                      </span>
                    </div>
                  ) : (
                    <div className="flex flex-col items-center gap-1.5 py-2">
                      <MdImage size={26} style={{ color: 'var(--text-secondary)' }} />
                      <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{showAgencyFields ? 'Drop a chat / form screenshot' : 'Drop a WhatsApp screenshot'}</span>
                      <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>{showAgencyFields ? 'or click / paste — we’ll read name, number & business details' : 'or click / paste — we’ll read name, number & details'}</span>
                    </div>
                  )}
                </div>

                {extracting && (
                  <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--accent-primary)' }}>
                    <MdAutoAwesome size={16} className="animate-pulse" /> Extracting details…
                  </div>
                )}
                {extractMsg && !extracting && (
                  <div className="flex items-start gap-2 text-xs p-2.5 rounded-md" style={{ backgroundColor: 'var(--accent-subtle)', color: 'var(--text-primary)' }}>
                    <MdAutoAwesome size={14} style={{ color: 'var(--accent-primary)', flexShrink: 0, marginTop: 1 }} />
                    <span>{extractMsg}</span>
                  </div>
                )}

                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border-primary)' }} />
                  <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>or enter manually</span>
                  <div className="flex-1 h-px" style={{ backgroundColor: 'var(--border-primary)' }} />
                </div>

                <div>
                  <label className={labelClass} style={{ color: 'var(--text-primary)' }}>Phone <span className="text-red-500">*</span></label>
                  <input className={inputClass} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+91 98765 43210" disabled={saving} />
                </div>
                <div>
                  <label className={labelClass} style={{ color: 'var(--text-primary)' }}>Name</label>
                  <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Full name" disabled={saving} />
                </div>
                <div>
                  <label className={labelClass} style={{ color: 'var(--text-primary)' }}>Email</label>
                  <input className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="name@example.com" disabled={saving} />
                </div>
              </>
            )}

            {/* ───────── STEP 2 — More ───────── */}
            {step === 2 && showAgencyFields && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass} style={{ color: 'var(--text-primary)' }}>Business name</label>
                    <input className={inputClass} value={businessName} onChange={(e) => setBusinessName(e.target.value)} placeholder="Company / brand" disabled={saving} />
                  </div>
                  <div>
                    <label className={labelClass} style={{ color: 'var(--text-primary)' }}>Business type</label>
                    <input className={inputClass} value={businessType} onChange={(e) => setBusinessType(e.target.value)} placeholder="e.g. interior design" disabled={saving} />
                  </div>
                  <div>
                    <label className={labelClass} style={{ color: 'var(--text-primary)' }}>Service interest</label>
                    <select className={inputClass} value={serviceInterest} onChange={(e) => setServiceInterest(e.target.value)} disabled={saving}>
                      <option value="">—</option>
                      {SERVICE_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelClass} style={{ color: 'var(--text-primary)' }}>City</label>
                    <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" disabled={saving} />
                  </div>
                  <div>
                    <label className={labelClass} style={{ color: 'var(--text-primary)' }}>Website status</label>
                    <input className={inputClass} value={websiteStatus} onChange={(e) => setWebsiteStatus(e.target.value)} placeholder="has site / no site / URL" disabled={saving} />
                  </div>
                  <div>
                    <label className={labelClass} style={{ color: 'var(--text-primary)' }}>Lead volume</label>
                    <input className={inputClass} value={leadVolume} onChange={(e) => setLeadVolume(e.target.value)} placeholder="e.g. ~100 / month" disabled={saving} />
                  </div>
                  <div className="col-span-2">
                    <label className={labelClass} style={{ color: 'var(--text-primary)' }}>Urgency</label>
                    <select className={inputClass} value={urgency} onChange={(e) => setUrgency(e.target.value)} disabled={saving}>
                      <option value="">—</option>
                      {URGENCY_OPTIONS.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                  </div>
                </div>

                <div>
                  <label className={labelClass} style={{ color: 'var(--text-primary)' }}>Note</label>
                  <textarea className={inputClass} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth remembering about this lead…" disabled={saving} />
                </div>
              </>
            )}

            {step === 2 && !showAgencyFields && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className={labelClass} style={{ color: 'var(--text-primary)' }}>City</label>
                    <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" disabled={saving} />
                  </div>
                  {showAviationFields && (
                    <div>
                      <label className={labelClass} style={{ color: 'var(--text-primary)' }}>Course interest</label>
                      <select className={inputClass} value={courseInterest} onChange={(e) => setCourseInterest(e.target.value)} disabled={saving}>
                        <option value="">—</option>
                        {COURSE_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                  )}
                  {showAviationFields && (
                    <div>
                      <label className={labelClass} style={{ color: 'var(--text-primary)' }}>Type</label>
                      <select className={inputClass} value={userType} onChange={(e) => setUserType(e.target.value)} disabled={saving}>
                        <option value="">—</option>
                        {USER_TYPE_OPTIONS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                      </select>
                    </div>
                  )}
                  <div className={showAviationFields ? '' : 'col-span-2'}>
                    <label className={labelClass} style={{ color: 'var(--text-primary)' }}>Education</label>
                    <input className={inputClass} value={education} onChange={(e) => setEducation(e.target.value)} placeholder="e.g. 12th with PCM" disabled={saving} />
                  </div>
                </div>

                <div>
                  <label className={labelClass} style={{ color: 'var(--text-primary)' }}>Note</label>
                  <textarea className={inputClass} rows={3} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Anything worth remembering about this lead…" disabled={saving} />
                </div>

                {/* Send welcome message */}
                <label
                  className="flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer"
                  style={{ borderColor: sendWelcome ? '#22C55E' : 'var(--border-primary)', backgroundColor: sendWelcome ? 'rgba(34,197,94,0.08)' : 'transparent' }}
                >
                  <input type="checkbox" checked={sendWelcome} onChange={(e) => setSendWelcome(e.target.checked)} disabled={saving} className="mt-0.5 w-4 h-4 accent-green-600" />
                  <span>
                    <span className="flex items-center gap-1.5 text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      <FaWhatsapp style={{ color: '#22C55E' }} /> Send welcome message now
                    </span>
                    <span className="block text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                      Sends the approved welcome template — safe even if they haven’t messaged us yet.
                    </span>
                  </span>
                </label>
              </>
            )}

            {error && (
              <div className="p-3 rounded-md bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
              </div>
            )}

            {/* Footer buttons */}
            <div className="flex gap-3 pt-1">
              {step === 1 ? (
                <>
                  <button
                    onClick={handleClose}
                    disabled={saving || extracting}
                    className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={() => { if (!phone.trim()) { setError('Phone number is required'); return } setError(null); setStep(2) }}
                    disabled={saving || extracting || !phone.trim()}
                    className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2 rounded-md text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                    style={{ backgroundColor: 'var(--button-bg, #2563eb)' }}
                  >
                    Next <MdArrowForward size={16} />
                  </button>
                </>
              ) : (
                <>
                  <button
                    onClick={() => { setError(null); setStep(1) }}
                    disabled={saving}
                    className="flex items-center justify-center gap-1.5 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-md text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors disabled:opacity-50 text-sm font-medium"
                  >
                    <MdArrowBack size={16} /> Back
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving || !phone.trim()}
                    className="flex-1 px-4 py-2 rounded-md text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium"
                    style={{ backgroundColor: 'var(--button-bg, #2563eb)' }}
                  >
                    {saving ? 'Adding…' : 'Add Lead'}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
