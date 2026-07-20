import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import Script from 'next/script'
import './globals.css'
import { brandConfig } from '@/configs'

const brandTheme = brandConfig.themeDataAttr || brandConfig.brand

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  weight: ['400', '500', '600', '700', '800', '900'],
})

const brandIcon = brandConfig.iconPath || '/logo.png'

export const metadata: Metadata = {
  title: brandConfig.brand === 'proxe' ? 'PROXe' : `PROXe ${brandConfig.name}`,
  description: `${brandConfig.name} Dashboard`,
  icons: {
    icon: brandIcon,
    shortcut: brandIcon,
    apple: brandIcon,
  },
}

// viewport-fit=cover exposes env(safe-area-inset-*) for notched phones
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning data-brand={brandConfig.brand} data-theme={brandTheme}>
      <body className={`${inter.className} ${inter.variable}`} suppressHydrationWarning>
        <Script
          id="theme-init"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var el = document.documentElement;
                  // Widget routes render inside a TRANSPARENT iframe on brand
                  // sites - never force the dashboard's dark theme there: the
                  // .dark body paint + color-scheme:dark make WebViews render
                  // an opaque dark canvas around the widget (Instagram bug).
                  if (location.pathname.indexOf('/widget') === 0) {
                    el.classList.remove('dark');
                    el.classList.remove('light');
                    return;
                  }
                  var t = localStorage.getItem('proxe-theme') || 'bw-dark';
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

