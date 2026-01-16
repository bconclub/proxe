import type { Metadata } from 'next'
import { Exo_2, Zen_Dots } from 'next/font/google'
import Script from 'next/script'
import './globals.css'

const exo2 = Exo_2({ 
  subsets: ['latin'],
  variable: '--font-exo-2',
})
const zenDots = Zen_Dots({ 
  subsets: ['latin'],
  weight: '400',
  variable: '--font-zen-dots',
})

export const metadata: Metadata = {
  title: 'WindChasers Dashboard',
  description: 'WindChasers Aviation Academy - Dashboard for managing leads, bookings, and metrics',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning data-brand="windchasers" data-theme="aviation-gold">
      <body className={`${exo2.className} ${zenDots.variable}`} suppressHydrationWarning>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme');
                  if (theme === 'light') {
                    document.documentElement.classList.add('light');
                    document.documentElement.classList.remove('dark');
                  } else {
                    document.documentElement.classList.add('dark');
                    document.documentElement.classList.remove('light');
                  }
                } catch (e) {
                  document.documentElement.classList.add('dark');
                }
              })();
            `,
          }}
        />
        {children}
      </body>
    </html>
  )
}

