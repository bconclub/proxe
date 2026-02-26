'use client'

import { Exo_2 } from 'next/font/google'
import { DeployModalProvider } from '@/contexts/DeployModalContext'
import '@/styles/theme.css'

const exo2 = Exo_2({
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-exo2',
})

export default function WidgetLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div
      className={exo2.variable}
      data-brand="windchasers"
      data-theme="aviation-gold"
      style={{ width: '100%', height: '100%' }}
    >
      <DeployModalProvider>
        {children}
      </DeployModalProvider>
    </div>
  )
}
