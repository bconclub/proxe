'use client';

import { useEffect, useState } from 'react';
import WebAgentSettingsClient from '../settings/web-agent/WebAgentSettingsClient';
import InstagramAgentTab from './InstagramAgentTab';
import WhatsAppAgentTab from './WhatsAppAgentTab';
import VoiceAgentTab from './VoiceAgentTab';

const tabs = [
  {
    id: 'Web',
    label: 'Web',
    icon: 'WWW',
    activeClass: 'bg-[var(--button-bg)] text-[var(--text-button)]',
    inactiveClass: 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]',
  },
  {
    id: 'WhatsApp',
    label: 'WhatsApp',
    icon: 'WA',
    activeClass: 'bg-[#22C55E] text-white',
    inactiveClass: 'text-[#22C55E] hover:text-[#4ADE80]',
  },
  {
    id: 'Instagram',
    label: 'Instagram',
    icon: 'IG',
    activeClass: 'text-white',
    inactiveClass: 'text-[#E4405F] hover:text-[#F97316]',
    activeStyle: {
      background: 'linear-gradient(135deg, #833AB4 0%, #E1306C 45%, #FCAF45 100%)',
    },
  },
  {
    id: 'Voice',
    label: 'Voice',
    icon: 'MIC',
    activeClass: 'bg-[#3B82F6] text-white',
    inactiveClass: 'text-[#60A5FA] hover:text-[#93C5FD]',
  },
] as const;

export default function AgentsPage() {
  const [active, setActive] = useState('Web');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const tab = params.get('tab');
    const authCode = params.get('code');
    const authState = params.get('state');

    if (tab === 'Instagram' || authCode || authState === 'windchasers-instagram-agent') {
      setActive('Instagram');
    }
  }, []);

  return (
    <div className="flex flex-col h-full" style={{ minHeight: 'calc(100vh - 60px)' }}>
      {/* Header */}
      <div className="px-6 pt-6 pb-0 border-b border-[var(--border-primary)]">
        <h1 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Agents</h1>
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActive(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors flex items-center gap-2 ${
                active === tab.id
                  ? tab.activeClass
                  : tab.inactiveClass
              }`}
              style={active === tab.id && 'activeStyle' in tab ? tab.activeStyle : undefined}
            >
              <span
                className={`text-[10px] font-black tracking-tight rounded px-1.5 py-0.5 ${
                  active === tab.id ? 'bg-white/20' : 'bg-white/10'
                }`}
              >
                {tab.icon}
              </span>
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content - Full height for widget preview */}
      <div className="flex-1 overflow-hidden" style={{ minHeight: 600 }}>
        {active === 'Web' && <WebAgentSettingsClient />}
        {active === 'WhatsApp' && <WhatsAppAgentTab />}
        {active === 'Instagram' && <InstagramAgentTab />}
        {active === 'Voice' && <VoiceAgentTab />}
      </div>
    </div>
  );
}
