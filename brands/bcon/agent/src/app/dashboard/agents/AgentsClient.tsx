'use client';
import { useState } from 'react';
import WebAgentSettingsClient from '../settings/web-agent/WebAgentSettingsClient';
import WhatsAppAgentTab from './WhatsAppAgentTab';
import VoiceAgentTab from './VoiceAgentTab';

const tabs = ['Web', 'WhatsApp', 'Voice'];

export default function AgentsClient() {
  const [active, setActive] = useState('Web');

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 pt-6 pb-0 border-b border-[var(--border-primary)]">
        <h1 className="text-xl font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>Agents</h1>
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActive(tab)}
              className={`px-4 py-2 text-sm font-medium rounded-t-lg transition-colors ${
                active === tab
                  ? 'bg-[var(--button-bg)] text-[var(--text-button)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-secondary)]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      <div className="flex-1 overflow-hidden">
        {active === 'Web' && <WebAgentSettingsClient />}
        {active === 'WhatsApp' && <WhatsAppAgentTab />}
        {active === 'Voice' && <VoiceAgentTab />}
      </div>
    </div>
  );
}
