'use client';
import { useState } from 'react';
import { MdContentCopy, MdCheckCircle, MdPhone } from 'react-icons/md';

export default function VoiceAgentTab() {
  // Default "call myself" details — prefilled so one click dials without re-typing.
  // Edit any field to call someone else; "Call myself" resets back to these.
  const DEFAULT_ME = { name: 'Thanzeel', business: 'BCON Club', industry: 'Marketing and AI', phone: '9731660933' };

  const [phone, setPhone] = useState(DEFAULT_ME.phone);
  const [personName, setPersonName] = useState(DEFAULT_ME.name);
  const [businessName, setBusinessName] = useState(DEFAULT_ME.business);
  const [industry, setIndustry] = useState(DEFAULT_ME.industry);
  const [status, setStatus] = useState('');
  const [calling, setCalling] = useState(false);
  const [copied, setCopied] = useState(false);
  const [live, setLive] = useState<null | { status: string; reasonText?: string | null; durationSeconds?: number | null }>(null);

  const voiceNumber = '+918046733388';
  // Contact name is OPTIONAL: with a name the agent greets the person; without
  // one it confirms the business and asks to be put through. Business + industry
  // + phone are still required for context.
  const canCall = !!(phone.trim() && businessName.trim() && industry.trim());

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
    try {
      const res = await fetch('/api/agent/voice/test-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...vals, direction: 'cold_intro' }),
      });
      const data = await res.json();
      if (data.success && data.callId) {
        setStatus(`Dialing +91 ${vals.phone}`);
        setLive({ status: 'queued' });
        pollStatus(String(data.callId));
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

  // Friendly live badge text/color from the polled status.
  function liveBadge(l: NonNullable<typeof live>): { txt: string; color: string } {
    if (l.status === 'queued' || l.status === 'ringing') return { txt: '📞 Ringing…', color: '#eab308' };
    if (l.status === 'in-progress') return { txt: '🟢 Connected — on the call', color: '#22c55e' };
    if (l.status === 'ended') {
      const dur = l.durationSeconds != null ? ` · ${l.durationSeconds}s` : '';
      const bad = /busy|no answer|timeout|unavailable|error|credit/i.test(l.reasonText || '');
      return { txt: `${bad ? '✗' : '✓'} ${l.reasonText || 'Call ended'}${dur}`, color: bad ? '#ef4444' : '#22c55e' };
    }
    return { txt: l.status, color: 'var(--text-secondary)' };
  }

  // One-click dial to myself: restore the default details, then call them directly
  // (pass values explicitly so we don't wait on async state updates).
  function callMyself() {
    setPersonName(DEFAULT_ME.name);
    setBusinessName(DEFAULT_ME.business);
    setIndustry(DEFAULT_ME.industry);
    setPhone(DEFAULT_ME.phone);
    triggerCall({
      phone: DEFAULT_ME.phone,
      contactName: DEFAULT_ME.name,
      businessName: DEFAULT_ME.business,
      industry: DEFAULT_ME.industry,
    });
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
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{voiceNumber} · voiceproxe.bconclub.com</p>
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
            PROXE will call with full context — contact name optional (it asks for the right person if blank)
          </p>
          {[
            { ph: 'Contact name (optional)', val: personName, set: setPersonName },
            { ph: 'Business name', val: businessName, set: setBusinessName },
            { ph: 'Industry', val: industry, set: setIndustry },
          ].map((f) => (
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
              placeholder="9731660933"
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

          {/* Buttons: one-click dial-myself + dial whoever is in the fields */}
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', justifyContent: 'center' }}>
            <button
              onClick={callMyself}
              disabled={calling}
              className="flex items-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{
                backgroundColor: 'var(--bg-tertiary)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-primary)',
                cursor: calling ? 'not-allowed' : 'pointer',
              }}
            >
              <MdPhone size={16} /> Call myself
            </button>
            <button
              onClick={() => triggerCall()}
              disabled={calling || !canCall}
              className="rounded-lg px-6 py-2.5 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
              style={{
                backgroundColor: 'var(--button-bg)',
                color: 'var(--text-button)',
                cursor: (calling || !canCall) ? 'not-allowed' : 'pointer',
              }}
            >
              {calling ? 'Calling...' : 'Call'}
            </button>
          </div>
          {status && !live && (
            <p className="text-sm" style={{ color: status.startsWith('Failed') || status.startsWith('Error') ? '#ef4444' : 'var(--text-secondary)' }}>
              {status}
            </p>
          )}
          {live && (
            <div className="flex flex-col items-center gap-1">
              <p className="text-sm font-semibold" style={{ color: liveBadge(live).color }}>
                {liveBadge(live).txt}
              </p>
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                {live.status === 'ended' ? 'Logged to the lead — open the inbox to see the full call.' : status}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
