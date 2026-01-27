import type { Metadata, Viewport } from 'next'
import { Exo_2 } from 'next/font/google'
import '@/styles/globals.css'
import '@/styles/theme.css'
import AnalyticsScripts from '@/components/shared/AnalyticsScripts'
import LoadingBar from '@/components/shared/LoadingBar'
import { DeployModalProvider } from '@/contexts/DeployModalContext'

const exo2 = Exo_2({
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-exo2',
})

export const metadata: Metadata = {
  title: 'Master',
  description: 'Master Platform',
  icons: {
    icon: '/star.svg',
    shortcut: '/star.svg',
    apple: '/star.svg',
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" data-brand="master" data-theme="default" className={exo2.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <AnalyticsScripts />
        <LoadingBar />
        <DeployModalProvider>
          {children}
        </DeployModalProvider>
      </body>
    </html>
  )
}

