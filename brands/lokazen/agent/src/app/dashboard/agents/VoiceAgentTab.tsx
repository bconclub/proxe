'use client';
import { useState } from 'react';
import { MdPhone, MdToggleOff, MdToggleOn } from 'react-icons/md';

export default function VoiceAgentTab() {
  const [enabled, setEnabled] = useState(false);
  const [number, setNumber] = useState('');
  const [saved, setSaved] = useState(false);

  function handleSave() {
    if (!number.trim()) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
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
      {/* Status bar */}
      <div className="flex items-center justify-between p-4 rounded-xl" style={{
        backgroundColor: 'var(--bg-secondary)',
        border: '1px solid var(--border-primary)',
      }}>
        <div className="flex items-center gap-3">
          <div className="w-2.5 h-2.5 rounded-full" style={{
            backgroundColor: enabled ? '#22c55e' : 'var(--text-muted)',
          }} />
          <div>
            <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>Voice Agent</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
              {enabled ? 'Active' : 'Not enabled'}
            </p>
          </div>
        </div>
        <button
          onClick={() => setEnabled(v => !v)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 0 }}
        >
          {enabled
            ? <MdToggleOn size={40} style={{ color: 'var(--accent-primary)' }} />
            : <MdToggleOff size={40} style={{ color: 'var(--text-muted)' }} />}
        </button>
      </div>

      {/* Not enabled state */}
      {!enabled && (
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '16px',
          padding: '48px 32px',
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: '16px',
          textAlign: 'center',
        }}>
          <MdPhone size={40} style={{ color: 'var(--text-muted)' }} />
          <p className="font-semibold text-base" style={{ color: 'var(--text-primary)' }}>
            Voice Agent is not enabled
          </p>
          <p className="text-sm" style={{ color: 'var(--text-secondary)', maxWidth: '360px' }}>
            Toggle on above to set up a voice number. You will need a phone number from a provider like Vapi or VoBiz.
          </p>
          <button
            onClick={() => setEnabled(true)}
            className="rounded-lg px-5 py-2 text-sm font-semibold transition-opacity hover:opacity-90"
            style={{
              backgroundColor: 'var(--button-bg)',
              color: 'var(--text-button)',
              cursor: 'pointer',
              border: 'none',
            }}
          >
            Enable Voice
          </button>
        </div>
      )}

      {/* Enabled state — enter number */}
      {enabled && (
        <div style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
          borderRadius: '16px',
          padding: '32px',
          display: 'flex',
          flexDirection: 'column',
          gap: '20px',
        }}>
          <div>
            <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>Voice Phone Number</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-secondary)' }}>
              Enter the number you have obtained from your voice provider (Vapi, VoBiz, etc.)
            </p>
          </div>
          <input
            type="text"
            placeholder="+91 XXXXX XXXXX"
            value={number}
            onChange={e => setNumber(e.target.value)}
            className="rounded-lg px-4 py-2.5 text-sm outline-none"
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
              maxWidth: '320px',
            }}
          />
          <div className="flex items-center gap-3">
            <button
              onClick={handleSave}
              disabled={!number.trim()}
              className="rounded-lg px-5 py-2 text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-40"
              style={{
                backgroundColor: 'var(--button-bg)',
                color: 'var(--text-button)',
                cursor: number.trim() ? 'pointer' : 'not-allowed',
                border: 'none',
              }}
            >
              {saved ? 'Saved!' : 'Save Number'}
            </button>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
              Full voice setup requires Vapi credentials in Vercel env vars.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
