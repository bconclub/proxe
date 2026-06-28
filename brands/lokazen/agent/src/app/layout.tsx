import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import { getCurrentBrandId, getBrandConfig, brandThemeMap } from '@/configs'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '800', '900'],
})

// Brand resolved from env (NEXT_PUBLIC_BRAND_ID/NEXT_PUBLIC_BRAND) at module load.
const brandId = getCurrentBrandId()
const brandConfig = getBrandConfig(brandId)
const brandTheme = brandThemeMap[brandId] || 'aviation-gold'

export const metadata: Metadata = {
  title: `PROXe ${brandConfig.name}`,
  description: `${brandConfig.name} Dashboard`,
  icons: {
    icon: '/logo.png',
    shortcut: '/logo.png',
    apple: '/logo.png',
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning data-brand={brandId} data-theme={brandTheme}>
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

