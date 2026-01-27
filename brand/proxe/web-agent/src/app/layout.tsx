import type { Metadata, Viewport } from 'next'
import { Exo_2 } from 'next/font/google'
import '@/styles/globals.css'
import '@/styles/theme.css'
import LoadingBar from '@/components/shared/LoadingBar'
import { DeployModalProvider } from '@/contexts/DeployModalContext'

const exo2 = Exo_2({
  weight: ['100', '200', '300', '400', '500', '600', '700', '800', '900'],
  subsets: ['latin'],
  display: 'swap',
  variable: '--font-exo2',
})

export const metadata: Metadata = {
  title: 'PROXe Web Agent',
  description: 'AI Chat Widget for PROXe',
  icons: {
    icon: '/favicon.ico',
    shortcut: '/favicon.ico',
    apple: '/favicon.ico',
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
    <html lang="en" data-brand="proxe" data-theme="purple-frost" className={exo2.variable} suppressHydrationWarning>
      <body suppressHydrationWarning>
        <LoadingBar />
        <DeployModalProvider>
          {children}
        </DeployModalProvider>
      </body>
    </html>
  )
}
