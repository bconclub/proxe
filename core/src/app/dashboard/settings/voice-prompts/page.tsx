'use client'

// Voice Prompts - standalone page. The editor itself lives in a shared component
// (VoicePromptsEditor) so it's identical here and embedded in the Voice agent tab.

import VoicePromptsEditor from '@/components/dashboard/VoicePromptsEditor'
import { MdRecordVoiceOver } from 'react-icons/md'

export default function VoicePromptsPage() {
  return (
    <>
      <div style={{ maxWidth: 860, margin: '0 auto', padding: '20px 20px 60px', color: 'var(--text-primary)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
          <MdRecordVoiceOver size={22} style={{ color: 'var(--accent-primary)' }} />
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0 }}>Voice Prompts</h1>
        </div>
        <VoicePromptsEditor />
      </div>
    </>
  )
}
