import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { getCurrentBrandId, brandThemeMap } from '@/configs'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '800', '900'],
})

export const metadata: Metadata = {
  title: 'Pulse of Punjab',
  description: 'Pulse of Punjab - Sab di sunenge. Grievance intake and follow-up for the campaign.',
  icons: {
    icon: '/pop-icon.png',
    shortcut: '/pop-icon.png',
    apple: '/pop-icon.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const brandId = getCurrentBrandId()
  const brandTheme = brandThemeMap[brandId] || 'bw-dark'
  return (
    <html lang="en" suppressHydrationWarning data-brand={brandId} data-theme="bw-dark">
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
                    el.setAttribute('data-theme', '${brandTheme}');
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

