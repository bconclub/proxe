'use client';
import { useState } from 'react';
import { MdMic, MdSend } from 'react-icons/md';

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
    <div style={{ display: 'flex', height: '100%', overflow: 'hidden' }}>
      {/* LEFT — Config Panel */}
      <div style={{
        flex: '0 0 40%',
        maxWidth: '40%',
        borderRight: '1px solid var(--border-primary)',
        backgroundColor: 'var(--bg-primary)',
        display: 'flex',
        flexDirection: 'column',
        padding: '28px 32px',
        gap: '20px',
        overflowY: 'auto',
      }}>
        {/* Status */}
        <div className="flex items-center gap-3 p-4 rounded-xl" style={{
          backgroundColor: 'var(--bg-secondary)',
          border: '1px solid var(--border-primary)',
        }}>
          <div className="w-2.5 h-2.5 rounded-full bg-green-400 animate-pulse" />
          <div>
            <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>WhatsApp Agent</p>
            <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>+918046733388 · BCON Club</p>
          </div>
        </div>

        {/* Divider */}
        <div style={{ height: '1px', backgroundColor: 'var(--border-primary)' }} />

        {/* Test Panel */}
        <div className="flex flex-col gap-3">
          <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Send Test Message</p>
          <input
            type="text"
            placeholder="Phone number (with country code)"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            className="rounded-lg px-3 py-2 text-sm outline-none"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
            }}
          />
          <textarea
            placeholder="Type a message..."
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={3}
            className="rounded-lg px-3 py-2 text-sm outline-none resize-none"
            style={{
              backgroundColor: 'var(--bg-secondary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-primary)',
            }}
          />
          <button
            onClick={sendTest}
            className="rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
            style={{
              backgroundColor: 'var(--button-bg)',
              color: 'var(--text-button)',
            }}
          >
            Send Test
          </button>
          {status && <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{status}</p>}
        </div>

        {/* Divider */}
        <div style={{ height: '1px', backgroundColor: 'var(--border-primary)' }} />

        {/* Info */}
        <div className="p-3 rounded-lg flex gap-2" style={{
          backgroundColor: 'rgba(139, 92, 246, 0.05)',
          border: '1px dashed rgba(139, 92, 246, 0.2)',
        }}>
          <p className="text-xs" style={{ color: 'var(--text-secondary)', lineHeight: '1.5' }}>
            Messages sent here go through the live WhatsApp agent. Responses will appear in the Inbox.
          </p>
        </div>
      </div>

      {/* RIGHT — Phone Mockup */}
      <div style={{
        flex: '1 1 60%',
        minWidth: 0,
        backgroundColor: '#141420',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        {/* Phone Frame */}
        <div style={{
          width: '375px',
          height: '680px',
          maxHeight: 'calc(100% - 40px)',
          borderRadius: '40px',
          border: '3px solid #3a3a4a',
          backgroundColor: '#0b141a',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
          position: 'relative',
          boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
        }}>
          {/* Notch */}
          <div style={{
            position: 'absolute',
            top: 0,
            left: '50%',
            transform: 'translateX(-50%)',
            width: '150px',
            height: '28px',
            backgroundColor: '#1a1a2e',
            borderRadius: '0 0 20px 20px',
            zIndex: 10,
            border: '2px solid #3a3a4a',
            borderTop: 'none',
          }} />

          {/* WhatsApp Header */}
          <div style={{
            backgroundColor: '#1f2c34',
            padding: '40px 16px 12px 16px',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            flexShrink: 0,
          }}>
            {/* Avatar */}
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: '#25D366',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '14px',
              fontWeight: 700,
              color: '#fff',
              flexShrink: 0,
            }}>B</div>
            <div>
              <p style={{ color: '#e9edef', fontSize: '15px', fontWeight: 600, lineHeight: 1.2 }}>BCON AI</p>
              <div style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                <div style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#25D366' }} />
                <span style={{ color: '#8696a0', fontSize: '11px' }}>online</span>
              </div>
            </div>
          </div>

          {/* Chat Area */}
          <div style={{
            flex: 1,
            backgroundColor: '#0b141a',
            padding: '16px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            overflowY: 'auto',
          }}>
            {/* Incoming message */}
            <div style={{ alignSelf: 'flex-start', maxWidth: '80%' }}>
              <div style={{
                backgroundColor: '#1f2c34',
                borderRadius: '0 8px 8px 8px',
                padding: '8px 12px',
              }}>
                <p style={{ color: '#e9edef', fontSize: '13px', lineHeight: 1.45 }}>
                  Hi, I&apos;m interested in your services
                </p>
                <span style={{ color: '#8696a0', fontSize: '10px', float: 'right', marginTop: '4px' }}>10:30 AM</span>
              </div>
            </div>

            {/* Outgoing message */}
            <div style={{ alignSelf: 'flex-end', maxWidth: '80%' }}>
              <div style={{
                backgroundColor: '#005c4b',
                borderRadius: '8px 0 8px 8px',
                padding: '8px 12px',
              }}>
                <p style={{ color: '#e9edef', fontSize: '13px', lineHeight: 1.45 }}>
                  Hey! Thanks for reaching out. Tell me about your business
                </p>
                <span style={{ color: '#8696a0', fontSize: '10px', float: 'right', marginTop: '4px' }}>10:31 AM</span>
              </div>
            </div>
          </div>

          {/* Input Bar */}
          <div style={{
            backgroundColor: '#1f2c34',
            padding: '8px 12px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            flexShrink: 0,
          }}>
            <div style={{
              flex: 1,
              backgroundColor: '#2a3942',
              borderRadius: '20px',
              padding: '8px 14px',
              color: '#8696a0',
              fontSize: '13px',
            }}>Type a message</div>
            <MdMic size={22} color="#8696a0" />
            <MdSend size={22} color="#8696a0" />
          </div>
        </div>
      </div>
    </div>
  );
}
