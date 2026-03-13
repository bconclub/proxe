'use client';
import { useState } from 'react';

export default function VoiceAgentTab() {
  const [phone, setPhone] = useState('');
  const [status, setStatus] = useState('');
  const [calling, setCalling] = useState(false);

  async function triggerTestCall() {
    if (!phone) return;
    setCalling(true);
    setStatus('Initiating call...');
    try {
      const res = await fetch('/api/agent/voice/test-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      setStatus(data.success ? `Call initiated to ${phone}` : `Failed: ${data.error}`);
    } catch {
      setStatus('Error initiating call');
    } finally {
      setCalling(false);
    }
  }

  return (
    <div className="p-6 flex flex-col gap-6 h-full">
      {/* Status */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
        <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
        <div>
          <p className="text-white font-medium">Voice Agent</p>
          <p className="text-white/50 text-sm">+918046733388 · voiceproxe.bconclub.com</p>
        </div>
      </div>

      {/* Inbound Info */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-2">
        <p className="text-white/70 text-sm font-medium">Inbound Calls</p>
        <p className="text-white text-sm">Customers can call <span className="text-[var(--accent-primary)]">+918046733388</span> and speak directly with the AI agent.</p>
      </div>

      {/* Test Outbound Call */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-3">
        <p className="text-white/70 text-sm font-medium">Trigger Test Call</p>
        <input
          type="text"
          placeholder="Your phone number (with country code)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="bg-white/10 text-white placeholder-white/30 rounded-lg px-3 py-2 text-sm outline-none border border-white/10"
        />
        <button
          onClick={triggerTestCall}
          disabled={calling}
          className="bg-[var(--accent-primary)] text-white rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
        >
          {calling ? 'Calling...' : 'Call Me'}
        </button>
        {status && <p className="text-sm text-white/60">{status}</p>}
      </div>

      {/* Pipeline Info */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-white/50 text-sm flex flex-col gap-1">
        <p>Pipeline: Vobiz → Sarvam STT → Claude Haiku → Sarvam TTS</p>
        <p>Server: voiceproxe.bconclub.com:3006</p>
      </div>
    </div>
  );
}
