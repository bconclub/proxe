'use client';

import { useEffect, useState } from 'react';

const INSTAGRAM_APP_ID = '1667051187795636';
const INSTAGRAM_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
].join(',');

export default function InstagramAgentTab() {
  const [authReturned, setAuthReturned] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authCode = params.get('code');
    const error = params.get('error') || params.get('error_reason');
    const errorDescription = params.get('error_description');

    setAuthReturned(Boolean(authCode));
    setAuthError(errorDescription || error);
  }, []);

  function getInstagramLoginUrl() {
    const redirectUri = `${window.location.origin}/dashboard/agents`;
    const params = new URLSearchParams({
      force_reauth: 'true',
      client_id: INSTAGRAM_APP_ID,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: INSTAGRAM_SCOPES,
      state: 'windchasers-instagram-agent',
    });

    return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
  }

  function handleConnectInstagram() {
    window.location.href = getInstagramLoginUrl();
  }

  return (
    <div className="h-full overflow-auto bg-[var(--bg-primary)]">
      <div className="grid min-h-full grid-cols-1 xl:grid-cols-[520px_1fr]">
        <section className="border-r border-[var(--border-primary)] bg-[var(--bg-secondary)] p-8">
          <div className="mb-8">
            <div className="mb-3 flex items-center gap-3">
              <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                Instagram Agent
              </h2>
              <span className="rounded-full border border-[var(--accent-primary)] px-2 py-0.5 text-xs font-bold uppercase tracking-wide text-[var(--accent-primary)]">
                Setup
              </span>
            </div>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              Connect the official WindChasers Instagram professional account so PROXe can route Instagram DMs and comments into the dashboard alongside WhatsApp and web chat.
            </p>
          </div>

          <div className="space-y-4">
            <button
              type="button"
              onClick={handleConnectInstagram}
              className="w-full rounded-lg bg-[var(--button-bg)] px-4 py-3 text-sm font-bold text-[var(--text-button)] transition-opacity hover:opacity-90"
            >
              Connect Instagram Business
            </button>

            {authReturned && (
              <div className="rounded-lg border border-[var(--accent-primary)] bg-[var(--accent-subtle)] p-4 text-sm text-[var(--accent-primary)]">
                Instagram authorization returned successfully. PROXe received the setup code and can continue account connection on the server.
              </div>
            )}

            {authError && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-400">
                Instagram authorization was not completed: {authError}
              </div>
            )}
          </div>

          <div className="mt-8 rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] p-5">
            <h3 className="mb-3 text-sm font-bold text-[var(--text-primary)]">
              App review screencast path
            </h3>
            <ol className="space-y-2 text-sm leading-6 text-[var(--text-secondary)]">
              <li>1. Open Dashboard, then Agents, then Instagram.</li>
              <li>2. Click Connect Instagram Business.</li>
              <li>3. Select the WindChasers Instagram professional account.</li>
              <li>4. Approve the requested basic, messages, and comments permissions.</li>
              <li>5. Return to PROXe and show the authorization success state.</li>
            </ol>
          </div>
        </section>

        <section className="p-8">
          <div className="mx-auto max-w-3xl rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-6">
            <h3 className="mb-4 text-lg font-bold text-[var(--text-primary)]">
              Instagram workflow
            </h3>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                ['1', 'Connect', 'Admin connects windchasersblr through Instagram Business Login.'],
                ['2', 'Receive', 'Meta webhooks send Instagram DMs and comments to PROXe.'],
                ['3', 'Respond', 'The WindChasers team handles enquiries in the dashboard.'],
              ].map(([step, title, body]) => (
                <div
                  key={step}
                  className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] p-4"
                >
                  <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-full bg-[var(--button-bg)] text-sm font-bold text-[var(--text-button)]">
                    {step}
                  </div>
                  <h4 className="mb-2 text-sm font-bold text-[var(--text-primary)]">{title}</h4>
                  <p className="text-xs leading-5 text-[var(--text-secondary)]">{body}</p>
                </div>
              ))}
            </div>

            <div className="mt-6 rounded-lg bg-[var(--bg-primary)] p-4">
              <p className="text-xs leading-5 text-[var(--text-secondary)]">
                Note: The webhook endpoint is already configured at /api/agent/instagram/meta. Server-side token exchange and permanent account storage are the next production steps after app review setup.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
