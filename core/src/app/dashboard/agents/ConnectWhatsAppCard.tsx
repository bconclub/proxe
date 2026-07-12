'use client';
/**
 * ConnectWhatsAppCard — Agents → WhatsApp connection panel.
 *
 * Shows the brand's live WhatsApp connection (from /api/dashboard/whatsapp/
 * connection) and runs Meta's Embedded Signup: the "Connect WhatsApp" button
 * opens Meta's own popup where the admin logs into Facebook, picks/creates
 * their WABA + number, and grants our app access. We receive a code +
 * waba_id/phone_number_id and the backend does the rest. No passwords or
 * tokens ever touch our UI.
 *
 * Frontend env (public):
 *   NEXT_PUBLIC_META_APP_ID        — Meta app id
 *   NEXT_PUBLIC_META_ES_CONFIG_ID  — Embedded Signup configuration id
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { FaWhatsapp } from 'react-icons/fa';

declare global {
  interface Window {
    FB?: any;
    fbAsyncInit?: () => void;
  }
}

type ConnectionStatus = {
  connected: boolean;
  source: 'connection' | 'env' | null;
  phoneNumberId?: string;
  wabaId?: string | null;
  displayPhoneNumber?: string | null;
  verifiedName?: string | null;
  qualityRating?: string | null;
  tokenValid?: boolean;
  embeddedSignupReady: boolean;
  error?: string;
};

const APP_ID = process.env.NEXT_PUBLIC_META_APP_ID || '';
const CONFIG_ID = process.env.NEXT_PUBLIC_META_ES_CONFIG_ID || '';

function loadFbSdk(appId: string): Promise<any> {
  return new Promise((resolve, reject) => {
    if (window.FB) return resolve(window.FB);
    window.fbAsyncInit = () => {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version: 'v21.0' });
      resolve(window.FB);
    };
    const s = document.createElement('script');
    s.src = 'https://connect.facebook.net/en_US/sdk.js';
    s.async = true;
    s.defer = true;
    s.crossOrigin = 'anonymous';
    s.onerror = () => reject(new Error('Failed to load the Meta SDK'));
    document.body.appendChild(s);
  });
}

export default function ConnectWhatsAppCard({ onStatus }: { onStatus?: (s: ConnectionStatus) => void }) {
  const [status, setStatus] = useState<ConnectionStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  // waba_id/phone_number_id arrive via postMessage from the popup; the auth
  // code arrives via FB.login's callback — whichever lands last completes.
  const signupData = useRef<{ wabaId?: string; phoneNumberId?: string; code?: string }>({});

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/dashboard/whatsapp/connection');
      const data = await res.json();
      if (res.ok) {
        setStatus(data);
        onStatus?.(data);
      } else {
        setStatus({ connected: false, source: null, embeddedSignupReady: false, error: data.error });
      }
    } catch {
      setStatus({ connected: false, source: null, embeddedSignupReady: false, error: 'Status check failed' });
    }
  }, [onStatus]);

  useEffect(() => { refresh(); }, [refresh]);

  const maybeComplete = useCallback(async () => {
    const { code, wabaId, phoneNumberId } = signupData.current;
    if (!code || !wabaId || !phoneNumberId) return;
    signupData.current = {};
    setMessage('Finishing setup — exchanging tokens, subscribing webhook, registering number…');
    try {
      const res = await fetch('/api/dashboard/whatsapp/connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, wabaId, phoneNumberId }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setMessage(`Connected ${data.displayPhoneNumber || ''} ✓`);
        await refresh();
      } else {
        setMessage(`Connect failed: ${data.error || 'unknown error'}`);
      }
    } catch (err: any) {
      setMessage(`Connect failed: ${err?.message || err}`);
    } finally {
      setBusy(false);
    }
  }, [refresh]);

  useEffect(() => {
    // Meta's popup posts session info (waba_id, phone_number_id) as it goes.
    const listener = (event: MessageEvent) => {
      if (typeof event.origin !== 'string' || !event.origin.endsWith('facebook.com')) return;
      try {
        const data = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (data?.type !== 'WA_EMBEDDED_SIGNUP') return;
        if (data.event === 'FINISH' || data.event === 'FINISH_ONLY_WABA') {
          signupData.current.wabaId = data.data?.waba_id;
          signupData.current.phoneNumberId = data.data?.phone_number_id;
          maybeComplete();
        } else if (data.event === 'CANCEL') {
          setBusy(false);
          setMessage(data.data?.current_step ? `Setup closed at: ${data.data.current_step}` : 'Setup closed.');
        } else if (data.event === 'ERROR') {
          setBusy(false);
          setMessage(`Meta reported an error: ${data.data?.error_message || 'unknown'}`);
        }
      } catch { /* non-JSON frames from other embeds — ignore */ }
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [maybeComplete]);

  async function connect() {
    if (!APP_ID || !CONFIG_ID) return;
    setBusy(true);
    setMessage('Opening Meta…');
    try {
      const FB = await loadFbSdk(APP_ID);
      FB.login(
        (response: any) => {
          const code = response?.authResponse?.code;
          if (code) {
            signupData.current.code = code;
            setMessage('Authorized — waiting for account details…');
            maybeComplete();
          } else {
            setBusy(false);
            setMessage('Login window closed before finishing.');
          }
        },
        {
          config_id: CONFIG_ID,
          response_type: 'code',
          override_default_response_type: true,
          extras: { setup: {}, featureType: '', sessionInfoVersion: '3' },
        },
      );
    } catch (err: any) {
      setBusy(false);
      setMessage(err?.message || 'Could not open the Meta signup window.');
    }
  }

  async function disconnect() {
    if (!window.confirm('Disconnect this WhatsApp number from PROXe? Sends will stop (or fall back to env credentials).')) return;
    setBusy(true);
    try {
      const res = await fetch('/api/dashboard/whatsapp/connection', { method: 'DELETE' });
      const data = await res.json();
      setMessage(res.ok ? 'Disconnected.' : `Failed: ${data.error}`);
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  const qualityColor =
    status?.qualityRating === 'GREEN' ? '#22C55E'
    : status?.qualityRating === 'YELLOW' ? '#EAB308'
    : status?.qualityRating === 'RED' ? '#EF4444'
    : 'var(--text-muted)';

  return (
    <div className="flex flex-col gap-3 p-4 rounded-xl" style={{
      backgroundColor: 'var(--bg-secondary)',
      border: '1px solid var(--border-primary)',
    }}>
      {/* Status row */}
      <div className="flex items-center gap-3">
        <div
          className={`w-2.5 h-2.5 rounded-full ${status?.connected ? 'bg-green-400 animate-pulse' : 'bg-gray-500'}`}
        />
        <div className="min-w-0 flex-1">
          <p className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
            WhatsApp Agent
          </p>
          <p className="text-xs truncate" style={{ color: 'var(--text-secondary)' }}>
            {status === null
              ? 'Checking connection…'
              : status.connected
                ? `${status.displayPhoneNumber || status.phoneNumberId}${status.verifiedName ? ` · ${status.verifiedName}` : ''}`
                : 'Not connected'}
          </p>
        </div>
        {status?.connected && status.qualityRating && (
          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full" style={{
            color: qualityColor,
            border: `1px solid ${qualityColor}`,
          }}>
            {status.qualityRating}
          </span>
        )}
        {status?.connected && (
          <span className="text-[10px] px-2 py-0.5 rounded-full" style={{
            color: 'var(--text-muted)',
            border: '1px solid var(--border-primary)',
          }}>
            {status.source === 'connection' ? 'Dashboard' : 'Env'}
          </span>
        )}
      </div>

      {/* Actions */}
      {status !== null && (
        status.embeddedSignupReady ? (
          <div className="flex gap-2">
            <button
              onClick={connect}
              disabled={busy}
              className="flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50"
              style={{ backgroundColor: '#22C55E', color: '#fff' }}
            >
              <FaWhatsapp size={15} />
              {status.connected ? 'Reconnect / change number' : 'Connect WhatsApp'}
            </button>
            {status.connected && status.source === 'connection' && (
              <button
                onClick={disconnect}
                disabled={busy}
                className="rounded-lg px-3 py-2 text-sm hover:opacity-90 transition-opacity disabled:opacity-50"
                style={{ color: 'var(--text-secondary)', border: '1px solid var(--border-primary)' }}
              >
                Disconnect
              </button>
            )}
          </div>
        ) : (
          <p className="text-xs" style={{ color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {status.connected
              ? 'Connected via environment credentials. To enable one-click connect, set NEXT_PUBLIC_META_APP_ID, META_APP_SECRET and NEXT_PUBLIC_META_ES_CONFIG_ID.'
              : 'One-click connect needs NEXT_PUBLIC_META_APP_ID, META_APP_SECRET and NEXT_PUBLIC_META_ES_CONFIG_ID (Embedded Signup configuration) in this deployment\'s env.'}
          </p>
        )
      )}

      {message && (
        <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>{message}</p>
      )}
    </div>
  );
}
