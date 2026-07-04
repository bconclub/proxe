'use client';
import { useEffect, useState } from 'react';
import { MdContentCopy, MdCheckCircle, MdPhone } from 'react-icons/md';
import { getBrandConfig, getCurrentBrandId } from '@/configs';

export default function VoiceAgentTab() {
  const isBcon = getCurrentBrandId() === 'bcon';
  const isPop = getCurrentBrandId() === 'pop';
  // Default "call myself" details — prefilled so one click dials without re-typing.
  // Edit any field to call someone else; "Call myself" resets back to these.
  // bcon keeps its live founder prefill; other brands get neutral placeholders.
  // Non-bcon brands (pop grievance) send NO business/industry — leaving the brand
  // name in `business` leaked it into the greeting and named the lead after the
  // brand ("Pulse of Punjab"). Keep them empty so the caller's real name (typed or
  // captured in-call) is the only name.
  const DEFAULT_ME = isBcon
    ? { name: 'Thanzeel', business: 'BCON Club', industry: 'Marketing and AI', phone: '9731660933' }
    : { name: '', business: '', industry: '', phone: '' };

  const [phone, setPhone] = useState(DEFAULT_ME.phone);
  const [personName, setPersonName] = useState(DEFAULT_ME.name);
  const [businessName, setBusinessName] = useState(DEFAULT_ME.business);
  const [industry, setIndustry] = useState(DEFAULT_ME.industry);
  const [status, setStatus] = useState('');
  const [calling, setCalling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [live, setLive] = useState<null | { status: string; reasonText?: string | null; durationSeconds?: number | null }>(null);
  // POP-only A/B: which engine dials — Vapi (orchestration + 11labs voice) or
  // ElevenLabs end-to-end (its own STT+LLM+TTS). Same Vobiz number either way.
  const [engine, setEngine] = useState<'vapi' | 'elevenlabs'>('vapi');
  // Live elapsed timer while a call is active (ringing/connected), so the status
  // panel counts up instead of only refreshing every poll.
  const [elapsed, setElapsed] = useState(0);
  const callActive = !!live && live.status !== 'ended';
  useEffect(() => {
    if (!callActive) return;
    const t = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(t);
  }, [callActive]);
  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(Math.max(0, s) % 60).padStart(2, '0')}`;

  const voiceNumber = isBcon
    ? '+918046733388'
    : (process.env.NEXT_PUBLIC_VOICE_NUMBER || 'Number pending');
  // Business + industry are BCON's B2B context — irrelevant for POP grievance
  // calls, where only a phone (and optional contact name) matter.
  const showBusinessFields = isBcon;
  // Contact name is OPTIONAL: with a name the agent greets the person; without
  // one it introduces itself and asks. Phone is always required; business +
  // industry are required only where they're shown (bcon).
  const canCall = !!phone.trim() && (!showBusinessFields || !!(businessName.trim() && industry.trim()));

  type CallVals = { phone: string; contactName: string; businessName: string; industry: string };

  async function triggerCall(override?: CallVals) {
    const vals: CallVals = override || {
      phone: phone.trim(),
      contactName: personName.trim(),
      businessName: businessName.trim(),
      industry: industry.trim(),
    };
    if (!override && !canCall) return;
    setCalling(true);
    setStatus('');
    setElapsed(0);
    setLive(null);
    try {
      const res = await fetch('/api/agent/voice/test-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...vals, direction: 'cold_intro', engine }),
      });
      const data = await res.json();
      if (data.success && data.callId) {
        setStatus('');
        // Vapi exposes live status via our call-status proxy; ElevenLabs calls
        // aren't tracked there yet, so we just show "dialing" for that engine.
        if (engine === 'elevenlabs') {
          setLive({ status: 'placed' });
        } else {
          setLive({ status: 'queued' });
          pollStatus(String(data.callId));
        }
      } else {
        setStatus(`Failed: ${typeof data.error === 'object' ? JSON.stringify(data.error) : data.error}`);
        setLive(null);
      }
    } catch {
      setStatus('Error — check server logs');
      setLive(null);
    } finally {
      setCalling(false);
    }
  }

  // Poll our backend (which proxies Vapi) for live call status until it ends, so
  // the card shows ringing -> connected -> ended instead of fire-and-forget.
  async function pollStatus(id: string) {
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      try {
        const r = await fetch(`/api/agent/voice/call-status?id=${encodeURIComponent(id)}`);
        const d = await r.json();
        if (d && d.status) {
          setLive({ status: d.status, reasonText: d.reasonText, durationSeconds: d.durationSeconds });
          if (d.ended) break;
        }
      } catch { /* transient — keep polling */ }
    }
  }

  // Map the polled/placed status to a clean live-panel model (label, colour,
  // whether it's still active, and — when ended — good/bad).
  function callState(l: NonNullable<typeof live>) {
    switch (l.status) {
      case 'queued':
      case 'ringing':
        return { label: 'Ringing…', color: '#eab308', active: true, ended: false };
      case 'placed':
        return { label: 'Dialing via ElevenLabs…', color: '#eab308', active: true, ended: false };
      case 'in-progress':
        return { label: 'Connected', color: '#22c55e', active: true, ended: false };
      case 'ended': {
        const bad = /busy|no answer|timeout|unavailable|error|credit|fail|declin/i.test(l.reasonText || '');
        return { label: l.reasonText || 'Call ended', color: bad ? '#ef4444' : '#22c55e', active: false, ended: true };
      }
      default:
        return { label: l.status, color: 'var(--text-secondary)', active: true, ended: false };
    }
  }

  function copyNumber() {
    navigator.clipboard.writeText(voiceNumber);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div style={{
      padding: '28px 32px',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      overflowY: 'auto',
      height: '100%',
    }}>
      {/* Status */}
      <div className="flex items-center gap-3 p-4 rounded-xl" style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
      }}>
        <div className="w-2.5 h-2.5 rounded-full animate-pulse" style={{ backgroundColor: '#22c55e' }} />
        <div>
          <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>Voice Agent</p>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{voiceNumber} · {isBcon ? 'voiceproxe.bconclub.com' : getBrandConfig().name}</p>
        </div>
      </div>

      {/* Two-column sections */}
      <div style={{ display: 'flex', gap: '24px' }}>
        {/* Section 1 — Inbound (Call Us) */}
        <div style={{
          flex: 1,
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: '16px',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '16px',
        }}>
          <MdPhone size={32} style={{ color: 'var(--accent-primary)' }} />
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Call to Test</h2>
          <p style={{
            color: 'var(--text-primary)',
            fontSize: '28px',
            fontWeight: 700,
            letterSpacing: '1px',
          }}>{voiceNumber}</p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Call this number to speak with the AI agent
          </p>
          <button
            onClick={copyNumber}
            className="flex items-center gap-2 rounded-lg px-5 py-2 text-sm font-semibold transition-all"
            style={{
              backgroundColor: copied ? 'var(--button-bg)' : 'var(--bg-tertiary)',
              color: copied ? 'var(--text-button)' : 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
              cursor: 'pointer',
            }}
          >
            {copied ? <MdCheckCircle size={16} /> : <MdContentCopy size={16} />}
            {copied ? 'Copied!' : 'Copy Number'}
          </button>
        </div>

        {/* Section 2 — Outbound call */}
        <div style={{
          flex: 1,
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: '16px',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          gap: '16px',
        }}>
          <MdPhone size={32} style={{ color: 'var(--accent-primary)' }} />
          <h2 className="text-lg font-bold" style={{ color: 'var(--text-primary)' }}>Call a Number</h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            {showBusinessFields
              ? 'PROXE will call with full context — contact name optional (it asks for the right person if blank)'
              : 'Enter a number to call. Contact name is optional — the agent introduces itself and asks.'}
          </p>
          {[
            { ph: 'Contact name (optional)', val: personName, set: setPersonName, show: true },
            { ph: 'Business name', val: businessName, set: setBusinessName, show: showBusinessFields },
            { ph: 'Industry', val: industry, set: setIndustry, show: showBusinessFields },
          ].filter((f) => f.show).map((f) => (
            <input
              key={f.ph}
              type="text"
              placeholder={f.ph}
              value={f.val}
              onChange={(e) => f.set(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') triggerCall(); }}
              className="rounded-lg px-4 py-2.5 text-sm outline-none w-full"
              style={{
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
                maxWidth: '320px',
                textAlign: 'center',
              }}
            />
          ))}

          {/* Phone with fixed +91 India code (route prepends 91 for routing) */}
          <div style={{ display: 'flex', gap: '8px', width: '100%', maxWidth: '320px' }}>
            <span
              className="rounded-lg px-3 text-sm font-semibold"
              style={{
                display: 'flex',
                alignItems: 'center',
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
              }}
            >
              +91
            </span>
            <input
              type="tel"
              inputMode="numeric"
              placeholder={isBcon ? '9731660933' : 'Enter phone number'}
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, '').slice(-10))}
              onKeyDown={(e) => { if (e.key === 'Enter') triggerCall(); }}
              className="rounded-lg px-4 py-2.5 text-sm outline-none"
              style={{
                flex: 1,
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
                textAlign: 'center',
              }}
            />
          </div>

          {/* POP A/B: pick which engine dials — same Vobiz number either way */}
          {isPop && (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
              <div
                style={{
                  display: 'inline-flex',
                  padding: '3px',
                  borderRadius: '10px',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-primary)',
                }}
              >
                {([['vapi', 'Vapi'], ['elevenlabs', 'ElevenLabs']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    onClick={() => setEngine(val)}
                    disabled={calling}
                    className="rounded-lg px-4 py-1.5 text-xs font-semibold transition-opacity"
                    style={{
                      backgroundColor: engine === val ? 'var(--button-bg)' : 'transparent',
                      color: engine === val ? 'var(--text-button)' : 'var(--text-secondary)',
                      border: 'none',
                      cursor: calling ? 'not-allowed' : 'pointer',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {engine === 'elevenlabs' ? 'ElevenLabs end-to-end · Grievance PUNJAB' : 'Vapi pipeline · POP Grievance Outbound'}
              </p>
            </div>
          )}

          {/* Single primary action — dials whoever is in the fields */}
          <button
            onClick={() => triggerCall()}
            disabled={calling || !canCall}
            className="flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{
              width: '100%',
              maxWidth: '340px',
              padding: '12px',
              backgroundColor: 'var(--button-bg)',
              color: 'var(--text-button)',
              cursor: (calling || !canCall) ? 'not-allowed' : 'pointer',
            }}
          >
            <MdPhone size={18} /> {calling ? 'Calling…' : 'Call'}
          </button>

          {/* Error / non-live status */}
          {status && !live && (
            <p className="text-sm" style={{ color: status.startsWith('Failed') || status.startsWith('Error') ? '#ef4444' : 'var(--text-secondary)' }}>
              {status}
            </p>
          )}

          {/* Live call panel — dialing → ringing → connected (timer) → ended */}
          {live && (() => {
            const s = callState(live);
            const secs = live.status === 'ended' ? (live.durationSeconds ?? elapsed) : elapsed;
            return (
              <div
                style={{
                  width: '100%',
                  maxWidth: '340px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '14px 16px',
                  borderRadius: '12px',
                  backgroundColor: 'var(--bg-primary)',
                  border: `1px solid ${s.ended ? 'var(--border-primary)' : s.color}`,
                }}
              >
                <span
                  className={s.active ? 'animate-pulse' : ''}
                  style={{
                    width: '11px',
                    height: '11px',
                    borderRadius: '50%',
                    backgroundColor: s.color,
                    boxShadow: `0 0 0 4px ${s.color}22`,
                    flex: 'none',
                  }}
                />
                <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                  <p className="text-sm font-semibold" style={{ color: s.color }}>{s.label}</p>
                  <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
                    {s.ended
                      ? 'Logged to the lead — open the inbox for the full call.'
                      : `+91 ${phone} · ${engine === 'elevenlabs' ? 'ElevenLabs' : 'Vapi'}`}
                  </p>
                </div>
                {live.status !== 'placed' && (s.active || live.durationSeconds != null) && (
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                    {mmss(secs)}
                  </span>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}
