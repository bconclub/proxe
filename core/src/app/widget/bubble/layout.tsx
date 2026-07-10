import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Chat Widget',
}

export default function BubbleLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <>
      <style>{`
        /* The widget lives in a TRANSPARENT iframe on brand sites. Two things
           must both hold or WebViews paint an opaque dark box around it:
           1. html/body background transparent (below), AND
           2. color-scheme must NOT be dark — modern WebKit/Chromium force an
              OPAQUE iframe canvas when the embedded doc's color-scheme
              mismatches the host page's (the Instagram in-app browser bug). */
        :root, html, body {
          color-scheme: normal !important;
        }
        html, body {
          background: transparent !important;
          background-color: transparent !important;
          margin: 0 !important;
          padding: 0 !important;
          overflow: hidden !important;
          width: 100% !important;
          height: 100% !important;
        }
      `}</style>
      {children}
    </>
  )
}
