'use client';
import { useEffect, useRef, useState } from 'react';
import {
  MdContentCopy, MdCheckCircle, MdPhone, MdGraphicEq, MdSignalCellularAlt,
  MdChatBubbleOutline, MdLink, MdShield, MdArrowForward, MdCallEnd,
} from 'react-icons/md';
import { getBrandConfig, getCurrentBrandId } from '@/configs';

export default function VoiceAgentTab() {
  const isBcon = getCurrentBrandId() === 'bcon';
  const isPop = getCurrentBrandId() === 'pop';
  // Default "call myself" details — prefilled so one click dials without re-typing.
  // bcon keeps its live founder prefill; other brands get neutral placeholders.
  // Non-bcon brands (pop grievance) send NO business/industry — leaving the brand
  // name in `business` leaked it into the greeting and named the lead after the brand.
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
  // POP-only A/B: which engine dials — V1 (Vapi orchestration + 11labs voice) or
  // V2 (ElevenLabs end-to-end: its own STT+LLM+TTS). Same number either way.
  const [engine, setEngine] = useState<'vapi' | 'elevenlabs' | 'sarvam'>('vapi');
  // POP-only: starting language for the grievance call. The agent begins here and
  // switches to whatever language the caller speaks. Lets us test pa/hi/en calls
  // individually. Same number, same engine — only the prompt + opening change.
  const [lang, setLang] = useState<'pa' | 'hi' | 'en'>('pa');
  const LANGS: Record<'pa' | 'hi' | 'en', { label: string; native: string }> = {
    pa: { label: 'Punjabi', native: 'ਪੰਜਾਬੀ' },
    hi: { label: 'Hindi', native: 'हिंदी' },
    en: { label: 'English', native: 'English' },
  };
  const [elapsed, setElapsed] = useState(0);
  // Manual-hangup flag: set by End Call so the status poll stops and never
  // re-shows "Talking" after the user has ended it. A ref (not state) so the
  // running poll loop reads the latest value without a re-subscribe.
  const endedRef = useRef(false);
  // The live call id being polled — needed so End Call can tell the backend
  // which call to hang up.
  const callIdRef = useRef<string | null>(null);
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
  const showBusinessFields = isBcon;
  const canCall = !!phone.trim() && (!showBusinessFields || !!(businessName.trim() && industry.trim()));
  // V1/V2 labels + the stack each runs, so it's clear what the flow is.
  const ENGINES: Record<'vapi' | 'elevenlabs' | 'sarvam', { label: string; stack: string; flow: string }> = {
    vapi: { label: 'V1', stack: 'Azure STT · GPT-4o-mini · 11Labs voice', flow: isPop ? 'POP Grievance Outbound' : getBrandConfig().name },
    elevenlabs: { label: 'V2', stack: 'ElevenLabs end-to-end · ASR + LLM + TTS', flow: 'Grievance PUNJAB' },
    sarvam: { label: 'V3', stack: 'Sarvam end-to-end · STT + LLM + TTS (over Vobiz stream)', flow: 'Sarvam Grievance' },
  };
  const activeFlow = isPop ? ENGINES[engine].flow : getBrandConfig().name;

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
    endedRef.current = false;
    callIdRef.current = null;
    try {
      const res = await fetch('/api/agent/voice/test-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...vals, direction: 'cold_intro', engine, language: lang }),
      });
      const data = await res.json();
      if (data.success && data.callId) {
        setStatus('');
        callIdRef.current = String(data.callId);
        if (engine === 'vapi') {
          // Vapi exposes live status via our call-status proxy.
          setLive({ status: 'queued' });
          pollStatus(String(data.callId));
        } else if (engine === 'sarvam') {
          // V3 pipeline tracks its own state (ringing → in-progress → ended).
          setLive({ status: 'placed' });
          pollStatus(String(data.callId), 'sarvam');
        } else {
          setLive({ status: 'placed' });
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

  async function pollStatus(id: string, eng?: string) {
    for (let i = 0; i < 80; i++) {
      await new Promise((r) => setTimeout(r, 3000));
      if (endedRef.current) return; // ended from the dashboard — stop polling
      try {
        const q = `id=${encodeURIComponent(id)}${eng ? `&engine=${eng}` : ''}`;
        const r = await fetch(`/api/agent/voice/call-status?${q}`);
        const d = await r.json();
        if (endedRef.current) return;
        if (d && d.status) {
          setLive({ status: d.status, reasonText: d.reasonText, durationSeconds: d.durationSeconds });
          if (d.ended) break;
        }
      } catch { /* transient — keep polling */ }
    }
  }

  // End the live call from the dashboard. Clears the UI immediately (so it can
  // never stay stuck on "Talking"), then best-effort tells the backend to hang
  // up the actual phone call.
  async function hangUp() {
    endedRef.current = true;
    const id = callIdRef.current;
    setLive({ status: 'ended', reasonText: 'Ended from dashboard' });
    if (!id) return;
    try {
      await fetch('/api/agent/voice/end-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, engine }),
      });
    } catch { /* UI already cleared; backend end is best-effort */ }
  }

  function callState(l: NonNullable<typeof live>) {
    switch (l.status) {
      case 'queued':
      case 'ringing':
        return { label: 'Ringing…', color: '#eab308', active: true, ended: false };
      case 'placed':
        return { label: 'Dialing…', color: '#eab308', active: true, ended: false };
      case 'in-progress':
        return { label: 'Talking', color: '#22c55e', active: true, ended: false };
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

  const inputStyle: React.CSSProperties = {
    backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)',
    border: '1px solid var(--border-primary)', borderRadius: 10, padding: '11px 14px',
    fontSize: 13.5, outline: 'none', width: '100%',
  };

  const CHECKS = [
    { icon: <MdGraphicEq size={18} />, title: 'Voice Quality', desc: "Clarity, naturalness, and stability of the agent's voice." },
    { icon: <MdSignalCellularAlt size={18} />, title: 'Latency', desc: 'Real-time responsiveness and interruption handling.' },
    { icon: <MdChatBubbleOutline size={18} />, title: 'Intro & Flow', desc: 'Agent introduction and correct start of the flow.' },
    { icon: <MdLink size={18} />, title: 'Pipeline Handoff', desc: 'Accurate handoff to the configured pipeline.' },
  ];

  return (
    <div style={{ padding: '24px 28px', display: 'flex', flexDirection: 'column', gap: 20, overflowY: 'auto', height: '100%' }}>
      {/* status bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 13, padding: '14px 18px', borderRadius: 14, background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)' }}>
        <span style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--accent-subtle)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <MdGraphicEq size={22} />
        </span>
        <div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 14, color: 'var(--text-primary)' }}>Voice Agent</p>
          <p style={{ margin: '2px 0 0', fontSize: 12.5, color: 'var(--text-secondary)' }}>
            {getBrandConfig().name} · Ready for testing · {voiceNumber}
          </p>
        </div>
        <span style={{ marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 11.5, fontWeight: 700, color: '#22c55e', padding: '5px 11px', borderRadius: 999, background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.3)' }}>
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} className="animate-pulse" /> Live
        </span>
      </div>

      {/* two columns: call form | what this test checks */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.6fr) minmax(0, 1fr)', gap: 20, alignItems: 'start' }}>
        {/* ── LEFT: call form ── */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 16, padding: 28, position: 'relative', overflow: 'hidden' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, color: 'var(--accent-primary)', marginBottom: 10 }}>
            <MdGraphicEq size={16} />
            <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6, textTransform: 'uppercase' }}>Test Voice Agent</span>
          </div>
          <h2 style={{ margin: '0 0 4px', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)' }}>Call a Number</h2>
          <p style={{ margin: '0 0 20px', fontSize: 13, color: 'var(--text-secondary)' }}>The agent will introduce itself and begin the configured flow.</p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxWidth: 460 }}>
            {/* contact name */}
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>Contact name (optional)</label>
              <input type="text" placeholder="e.g., Ravi Sharma" value={personName}
                onChange={(e) => setPersonName(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') triggerCall(); }} style={inputStyle} />
            </div>

            {/* bcon-only business context */}
            {showBusinessFields && (
              <div style={{ display: 'flex', gap: 12 }}>
                <input type="text" placeholder="Business name" value={businessName} onChange={(e) => setBusinessName(e.target.value)} style={inputStyle} />
                <input type="text" placeholder="Industry" value={industry} onChange={(e) => setIndustry(e.target.value)} style={inputStyle} />
              </div>
            )}

            {/* phone */}
            <div>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>Phone number</label>
              <div style={{ display: 'flex', gap: 8 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '0 12px', borderRadius: 10, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', border: '1px solid var(--border-primary)', fontSize: 13.5, fontWeight: 700 }}>
                  🇮🇳 +91
                </span>
                <input type="tel" inputMode="numeric" placeholder="Enter phone number" value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^\d]/g, '').slice(-10))}
                  onKeyDown={(e) => { if (e.key === 'Enter') triggerCall(); }} style={inputStyle} />
              </div>
            </div>

            {/* V1 / V2 provider (pop A/B) */}
            {isPop && (
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>Outbound provider</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['vapi', 'elevenlabs', 'sarvam'] as const).map((val) => {
                    const on = engine === val;
                    const c = val === 'sarvam' ? '#8b5cf6' : 'var(--accent-primary)';
                    return (
                      <button key={val} onClick={() => setEngine(val)} disabled={calling}
                        style={{
                          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '11px 12px', borderRadius: 10,
                          fontSize: 13, fontWeight: 800, cursor: calling ? 'not-allowed' : 'pointer',
                          background: on ? (val === 'sarvam' ? '#8b5cf622' : 'var(--accent-subtle)') : 'var(--bg-primary)',
                          color: on ? c : 'var(--text-secondary)',
                          border: `1px solid ${on ? c : 'var(--border-primary)'}`,
                        }}>
                        <MdGraphicEq size={15} /> {ENGINES[val].label}
                      </button>
                    );
                  })}
                </div>
                <p style={{ margin: '7px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>{ENGINES[engine].stack}</p>
              </div>
            )}

            {/* Starting language (pop grievance) — agent begins here, switches to the caller */}
            {isPop && (
              <div>
                <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 6 }}>Starting language</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  {(['pa', 'hi', 'en'] as const).map((val) => {
                    const on = lang === val;
                    return (
                      <button key={val} onClick={() => setLang(val)} disabled={calling}
                        style={{
                          flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '9px 12px', borderRadius: 10,
                          fontSize: 13, fontWeight: 800, cursor: calling ? 'not-allowed' : 'pointer',
                          background: on ? 'var(--accent-subtle)' : 'var(--bg-primary)',
                          color: on ? 'var(--accent-primary)' : 'var(--text-secondary)',
                          border: `1px solid ${on ? 'var(--accent-primary)' : 'var(--border-primary)'}`,
                        }}>
                        <span style={{ fontSize: 15 }}>{LANGS[val].native}</span>
                        <span style={{ fontSize: 10.5, fontWeight: 600, opacity: 0.8 }}>{LANGS[val].label}</span>
                      </button>
                    );
                  })}
                </div>
                <p style={{ margin: '7px 0 0', fontSize: 11, color: 'var(--text-muted)' }}>Agent opens in {LANGS[lang].label}, then follows the caller's language.</p>
              </div>
            )}

            {/* active flow */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12.5, color: 'var(--text-secondary)' }}>
              <MdLink size={15} style={{ color: 'var(--accent-primary)' }} />
              Active flow: <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>{activeFlow}</span>
            </div>

            {/* start */}
            <button onClick={() => triggerCall()} disabled={calling || !canCall}
              style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 9, padding: '14px', borderRadius: 12, marginTop: 4,
                fontSize: 15, fontWeight: 800, border: 'none', width: '100%',
                background: 'var(--button-bg)', color: 'var(--text-button)',
                cursor: (calling || !canCall) ? 'not-allowed' : 'pointer', opacity: (calling || !canCall) ? 0.5 : 1,
              }}>
              <MdPhone size={19} /> {calling ? 'Calling…' : 'Start Test Call'}
            </button>
            <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <MdShield size={12} /> This test call uses real minutes from your plan.
            </p>

            {/* error / non-live status */}
            {status && !live && (
              <p style={{ fontSize: 13, textAlign: 'center', color: status.startsWith('Failed') || status.startsWith('Error') ? '#ef4444' : 'var(--text-secondary)' }}>{status}</p>
            )}

            {/* live call panel */}
            {live && (() => {
              const s = callState(live);
              const secs = live.status === 'ended' ? (live.durationSeconds ?? elapsed) : elapsed;
              return (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px', borderRadius: 12, background: 'var(--bg-primary)', border: `1px solid ${s.ended ? 'var(--border-primary)' : s.color}` }}>
                  <span className={s.active ? 'animate-pulse' : ''} style={{ width: 11, height: 11, borderRadius: '50%', background: s.color, boxShadow: `0 0 0 4px ${s.color}22`, flex: 'none' }} />
                  <div style={{ flex: 1, textAlign: 'left', minWidth: 0 }}>
                    <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: s.color }}>{s.label}</p>
                    <p style={{ margin: '2px 0 0', fontSize: 11.5, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {s.ended ? 'Logged — open Call Logs for the full breakdown.' : `+91 ${phone} · ${ENGINES[engine].label}`}
                    </p>
                  </div>
                  {live.status !== 'placed' && (s.active || live.durationSeconds != null) && (
                    <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{mmss(secs)}</span>
                  )}
                  {s.active && (
                    <button onClick={hangUp} title="End call"
                      style={{
                        display: 'flex', alignItems: 'center', gap: 6, padding: '7px 13px', borderRadius: 999,
                        border: '1px solid #ef444455', background: '#ef44441a', color: '#ef4444',
                        fontSize: 12.5, fontWeight: 800, cursor: 'pointer', flex: 'none',
                      }}>
                      <MdCallEnd size={16} /> End Call
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        </div>

        {/* ── RIGHT: what this test checks ── */}
        <div style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-primary)', borderRadius: 16, padding: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <MdShield size={18} style={{ color: 'var(--accent-primary)' }} />
            <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)' }}>What this test checks</span>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {CHECKS.map((c) => (
              <div key={c.title} style={{ display: 'flex', gap: 12 }}>
                <span style={{ width: 36, height: 36, flexShrink: 0, borderRadius: 10, background: 'var(--accent-subtle)', color: 'var(--accent-primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{c.icon}</span>
                <div>
                  <p style={{ margin: 0, fontSize: 13.5, fontWeight: 700, color: 'var(--text-primary)' }}>{c.title}</p>
                  <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.45 }}>{c.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* link to the Calls eval */}
          <a href="/dashboard/settings/brain" style={{
            display: 'flex', alignItems: 'center', gap: 10, marginTop: 18, padding: '13px 15px', borderRadius: 12,
            background: 'var(--bg-primary)', border: '1px solid var(--border-primary)', textDecoration: 'none',
          }}>
            <MdSignalCellularAlt size={18} style={{ color: 'var(--accent-primary)', flexShrink: 0 }} />
            <span style={{ fontSize: 12.5, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
              Monitor live activity and detailed logs in <span style={{ color: 'var(--accent-primary)', fontWeight: 700 }}>Call Logs</span>
            </span>
            <MdArrowForward size={16} style={{ color: 'var(--text-muted)', marginLeft: 'auto', flexShrink: 0 }} />
          </a>

          {/* inbound number (small, for reference) */}
          <button onClick={copyNumber} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%', marginTop: 10, padding: '10px', borderRadius: 10,
            background: 'transparent', border: '1px dashed var(--border-primary)', color: 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer',
          }}>
            {copied ? <MdCheckCircle size={14} /> : <MdContentCopy size={14} />} {copied ? 'Copied!' : `Inbound: ${voiceNumber}`}
          </button>
        </div>
      </div>
    </div>
  );
}
