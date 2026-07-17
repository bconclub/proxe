'use client';

// Configure — a card grid launcher. Every setting area is one card; the inline
// sections that used to live on this page moved to their own routes:
//   Appearance → /dashboard/settings/appearance
//   Widget Appearance → /dashboard/settings/widget
//   Notifications & Sounds → /dashboard/settings/notifications

import {
  MdPsychology, MdGroup, MdGridView, MdOutlineForum, MdHub,
  MdNotificationsActive, MdPalette, MdChatBubbleOutline, MdToken,
  MdSupportAgent,
} from 'react-icons/md';
import { getBrandConfig, brandLabel } from '@/configs';

type Card = {
  href: string;
  title: string;
  desc: string;
  icon: React.ReactNode;
  color: string; // icon tile tint
  chips?: Array<{ label: string; tone?: string }>;
  gated?: boolean;
};

export default function SettingsPage() {
  const brain = !!getBrandConfig().features?.brain;

  const CARDS: Card[] = [
    {
      href: '/dashboard/settings/brain', title: 'The Brain',
      desc: 'The living brain — tap the orb and it speaks today’s briefing in the agent’s voice.',
      icon: <MdPsychology size={22} />, color: '#8b5cf6',
      chips: [{ label: '● Alive', tone: '#22c55e' }], gated: !brain,
    },
    {
      href: '/dashboard/settings/users', title: 'Team & Access',
      desc: `Invite teammates, set roles, revoke access. Every ${brandLabel('Lead').toLowerCase()} action is logged by name.`,
      icon: <MdGroup size={22} />, color: '#3b82f6',
    },
    {
      href: '/dashboard/settings/features', title: 'Features',
      desc: 'Switch Voice/Calls, Dashboard Brain and other features on or off — no redeploy.',
      icon: <MdGridView size={22} />, color: '#22c55e',
    },
    {
      href: '/dashboard/settings/whatsapp-templates', title: 'WhatsApp',
      desc: 'Number health, quality rating, messaging tier and send volume, plus message templates.',
      icon: <MdOutlineForum size={22} />, color: '#25d366',
    },
    {
      href: '/dashboard/config', title: 'Integrations & Connections',
      desc: 'Connection status for every integration, which secrets are set, channels and sources.',
      icon: <MdHub size={22} />, color: '#6366f1',
    },
    {
      href: '/dashboard/settings/notifications', title: 'Notifications & Sounds',
      desc: 'Master mute, per-event sound toggles, and previews.',
      icon: <MdNotificationsActive size={22} />, color: '#f59e0b',
    },
    {
      href: '/dashboard/settings/appearance', title: 'Appearance',
      desc: 'Dark or light mode, accent color, and a live preview of the theme.',
      icon: <MdPalette size={22} />, color: '#ec4899',
    },
    {
      href: '/dashboard/settings/widget', title: 'Widget Appearance',
      desc: 'How the widget appears on your website — search bar or floating chat bubble.',
      icon: <MdChatBubbleOutline size={22} />, color: '#a855f7',
    },
    {
      href: '/dashboard/settings/support', title: 'Support',
      desc: 'Every issue the team has reported — status, screenshots, and fix notes in one place.',
      icon: <MdSupportAgent size={22} />, color: '#0ea5e9',
    },
    {
      href: '/tokens', title: 'Token Usage',
      desc: 'Roughly how much Claude spend goes to agent chat, scoring, and notes.',
      icon: <MdToken size={22} />, color: '#64748b',
      chips: [{ label: 'Test', tone: '#f59e0b' }],
    },
  ];

  return (
    <>
      <div className="p-6">
        <h1 className="text-xl font-bold mb-1" style={{ color: 'var(--text-primary)' }}>Configure</h1>
        <p className="text-xs mb-6" style={{ color: 'var(--text-secondary)' }}>Everything that shapes how PROXe runs, in one place.</p>

        <style>{`
          .cfg-card { transition: transform .15s ease, border-color .15s ease, box-shadow .15s ease; }
          .cfg-card:hover { transform: translateY(-2px); border-color: var(--accent-primary) !important; box-shadow: 0 8px 24px rgba(0,0,0,.25); }
          .cfg-card:hover .cfg-arrow { opacity: 1; transform: translateX(0); }
        `}</style>

        <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))' }}>
          {CARDS.filter((c) => !c.gated).map((c) => (
            <a
              key={c.href}
              href={c.href}
              className="cfg-card block p-5 rounded-xl border"
              style={{ background: 'var(--bg-secondary)', borderColor: 'var(--border-primary)', textDecoration: 'none' }}
            >
              <div className="flex items-start justify-between gap-3">
                <span
                  className="flex items-center justify-center flex-shrink-0"
                  style={{ width: 42, height: 42, borderRadius: 12, background: `${c.color}1c`, color: c.color }}
                >
                  {c.icon}
                </span>
                <span className="cfg-arrow text-lg" style={{ color: 'var(--accent-primary)', opacity: 0, transform: 'translateX(-4px)', transition: 'all .15s ease' }}>→</span>
              </div>
              <h3 className="text-sm font-semibold mt-4 mb-1" style={{ color: 'var(--text-primary)' }}>{c.title}</h3>
              <p className="text-xs leading-relaxed" style={{ color: 'var(--text-secondary)', minHeight: 32 }}>{c.desc}</p>
              {c.chips && c.chips.length > 0 && (
                <div className="flex gap-2 mt-3 flex-wrap">
                  {c.chips.map((ch) => (
                    <span
                      key={ch.label}
                      className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                      style={{ background: `${ch.tone || '#64748b'}22`, color: ch.tone || 'var(--text-secondary)' }}
                    >
                      {ch.label}
                    </span>
                  ))}
                </div>
              )}
            </a>
          ))}
        </div>
      </div>
    </>
  );
}
