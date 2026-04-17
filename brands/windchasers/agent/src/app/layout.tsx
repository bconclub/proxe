import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '800', '900'],
})

export const metadata: Metadata = {
  title: 'PROXe BCON',
  description: 'BCON Club - Dashboard for managing leads, bookings, and metrics',
  icons: {
    icon: '/bcon-icon.png',
    shortcut: '/bcon-icon.png',
    apple: '/bcon-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning data-brand="bcon" data-theme="bw-dark">
      <body className={`${inter.className} ${inter.variable}`} suppressHydrationWarning>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var t = localStorage.getItem('proxe-theme') || 'bw-dark';
                  var el = document.documentElement;
                  if (t === 'bw-light') {
                    el.setAttribute('data-theme', 'bw-light');
                    el.classList.add('light');
                    el.classList.remove('dark');
                  } else if (t === 'brand') {
                    el.setAttribute('data-theme', 'bcon-electric');
                    el.classList.add('dark');
                    el.classList.remove('light');
                  } else {
                    el.setAttribute('data-theme', 'bw-dark');
                    el.classList.add('dark');
                    el.classList.remove('light');
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

