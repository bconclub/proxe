'use client'

import { ChatWidget } from '@/components/ChatWidget'

export default function HomePage() {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/chat'
  
  return (
    <div style={{ 
      width: '100vw', 
      height: '100vh', 
      display: 'flex', 
      alignItems: 'center', 
      justifyContent: 'center',
      backgroundColor: 'transparent'
    }}>
      <ChatWidget apiUrl={apiUrl} />
    </div>
  )
}
