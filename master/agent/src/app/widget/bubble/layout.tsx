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
