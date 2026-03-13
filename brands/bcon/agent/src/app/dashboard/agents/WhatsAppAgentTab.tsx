'use client';
import { useState } from 'react';

export default function WhatsAppAgentTab() {
  const [phone, setPhone] = useState('');
  const [message, setMessage] = useState('');
  const [status, setStatus] = useState('');

  async function sendTest() {
    if (!phone || !message) return;
    setStatus('Sending...');
    try {
      const res = await fetch('/api/agent/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, message }),
      });
      const data = await res.json();
      setStatus(data.success ? 'Sent!' : `Failed: ${data.error}`);
    } catch {
      setStatus('Error sending message');
    }
  }

  return (
    <div className="p-6 flex flex-col gap-6 h-full">
      {/* Status */}
      <div className="flex items-center gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
        <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
        <div>
          <p className="text-white font-medium">WhatsApp Agent</p>
          <p className="text-white/50 text-sm">+918046733388 · BCON Club</p>
        </div>
      </div>

      {/* Test Panel */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 flex flex-col gap-3">
        <p className="text-white/70 text-sm font-medium">Send Test Message</p>
        <input
          type="text"
          placeholder="Phone number (with country code)"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          className="bg-white/10 text-white placeholder-white/30 rounded-lg px-3 py-2 text-sm outline-none border border-white/10"
        />
        <textarea
          placeholder="Type a message..."
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          className="bg-white/10 text-white placeholder-white/30 rounded-lg px-3 py-2 text-sm outline-none border border-white/10 resize-none"
        />
        <button
          onClick={sendTest}
          className="bg-[var(--accent-primary)] text-white rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
        >
          Send Test
        </button>
        {status && <p className="text-sm text-white/60">{status}</p>}
      </div>

      {/* Info */}
      <div className="p-4 rounded-xl bg-white/5 border border-white/10 text-white/50 text-sm">
        <p>Messages sent here go through the live WhatsApp agent. Responses will appear in the Inbox.</p>
      </div>
    </div>
  );
}
