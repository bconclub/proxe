'use client';

import { useEffect, useState } from 'react';
import { FaInstagram } from 'react-icons/fa';
import { getBrandConfig, getCurrentBrandId } from '@/configs';

const BRAND_ID = getCurrentBrandId();

// windchasers/lokazen still run the original windchasers Instagram app;
// newer brands (bcon, pop) use the central PROXe-IG app (Tech Provider).
const LEGACY_IG_APP_BRANDS = ['windchasers', 'lokazen'];
const INSTAGRAM_APP_ID = LEGACY_IG_APP_BRANDS.includes(BRAND_ID)
  ? '1667051187795636'
  : '734209706078170';
const INSTAGRAM_SCOPES = [
  'instagram_business_basic',
  'instagram_business_manage_messages',
  'instagram_business_manage_comments',
].join(',');

// Brand-specific - never hardcode another brand's account here. Env wins;
// known brand handles keep their fork-exact default.
const TARGET_ACCOUNT =
  process.env.NEXT_PUBLIC_IG_ACCOUNT ||
  ({ windchasers: '@windchasersblr', bcon: '@bconclub' } as Record<string, string>)[BRAND_ID] ||
  'your Instagram account';

export default function InstagramAgentTab() {
  const brandName = getBrandConfig().name;
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
      // Same literal value as before for windchasers; brand-scoped for the rest.
      state: `${BRAND_ID}-instagram-agent`,
    });

    return `https://www.instagram.com/oauth/authorize?${params.toString()}`;
  }

  function handleConnectInstagram() {
    window.location.href = getInstagramLoginUrl();
  }

  return (
    <div className="h-full overflow-auto bg-[var(--bg-primary)] px-5 py-6 md:px-8">
      <div className="mx-auto grid max-w-6xl gap-6 xl:grid-cols-[minmax(360px,480px)_1fr]">
        <section className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-6 md:p-8">
          <div className="mb-8">
            <div className="mb-4 flex items-center gap-4">
              <div
                className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-2xl text-base font-black text-white shadow-lg"
                style={{
                  background: 'linear-gradient(135deg, #833AB4 0%, #E1306C 45%, #FCAF45 100%)',
                }}
                aria-hidden="true"
              >
                <FaInstagram size={28} />
              </div>
              <div>
                <p className="mb-1 text-xs font-black uppercase tracking-widest text-[#E1306C]">
                  Instagram Business
                </p>
                <h2 className="text-2xl font-bold text-[var(--text-primary)]">
                  Instagram Agent
                </h2>
              </div>
            </div>
            <p className="text-sm leading-6 text-[var(--text-secondary)]">
              Connect the official {brandName} Instagram professional account so PROXe can route Instagram DMs and comments into the dashboard alongside WhatsApp and web chat.
            </p>
            <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-[var(--border-primary)] bg-[var(--bg-tertiary)] px-3 py-1 text-xs font-bold text-[var(--text-primary)]">
              <span className="h-2 w-2 rounded-full bg-[#E1306C]" />
              Target account: {TARGET_ACCOUNT}
            </div>
          </div>

          <div className="space-y-4">
            <button
              type="button"
              onClick={handleConnectInstagram}
              className="flex w-full items-center justify-center gap-2 rounded-lg px-4 py-3 text-sm font-bold text-white shadow-lg transition-opacity hover:opacity-90"
              style={{ background: 'linear-gradient(135deg, #833AB4 0%, #E1306C 45%, #FCAF45 100%)' }}
            >
              <FaInstagram size={18} />
              Connect to Instagram Business
            </button>

            <div className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-tertiary)] p-4">
              <div className="mb-2 flex items-center gap-2 text-sm font-bold text-[var(--text-primary)]">
                <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                Instagram connection pending
              </div>
              <p className="text-xs leading-5 text-[var(--text-secondary)]">
                Complete Instagram Business Login to authorize account identity, DMs, and comments for the {brandName} workspace.
              </p>
            </div>

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
              <li>3. Select the {brandName} Instagram professional account.</li>
              <li>4. Approve the requested basic, messages, and comments permissions.</li>
              <li>5. Return to PROXe and show the authorization success state.</li>
            </ol>
          </div>
        </section>

        <section className="rounded-lg border border-[var(--border-primary)] bg-[var(--bg-secondary)] p-6 md:p-8">
          <div className="mx-auto max-w-3xl">
            <h3 className="mb-4 text-lg font-bold text-[var(--text-primary)]">
              Instagram workflow
            </h3>
            <div className="grid gap-4 md:grid-cols-3">
              {[
                ['1', 'Connect', `Admin connects ${TARGET_ACCOUNT} through Instagram Business Login.`],
                ['2', 'Receive', 'Meta webhooks send Instagram DMs and comments to PROXe.'],
                ['3', 'Respond', `The ${brandName} team handles enquiries in the dashboard.`],
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
                {LEGACY_IG_APP_BRANDS.includes(BRAND_ID)
                  ? 'Note: The webhook endpoint is already configured at /api/agent/instagram/meta. Server-side token exchange and permanent account storage are the next production steps after app review setup.'
                  : 'Note: The webhook endpoint is configured at /api/agent/meta/instagram. Incoming Instagram DMs and comments are routed into the unified inbox on the Social channel.'}
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
