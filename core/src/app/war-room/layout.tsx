import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import ThemeProvider from '@/components/dashboard/ThemeProvider'

// War Room now lives inside the dashboard shell - same left sidebar + artifact
// switcher as the rest of PROXe (the "make War Room like the dashboard" ask).
// Auth mirrors app/dashboard/layout.tsx; the page still keeps its own feature
// gate + isolated error fallback so a war-room failure can't take PROXe down.
export const dynamic = 'force-dynamic'

export default async function WarRoomLayout({ children }: { children: React.ReactNode }) {
  try {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error) {
      const status = (error as any)?.status
      if (status === 429) {
        // rate limited - allow through with degraded experience
      } else {
        redirect('/auth/login')
      }
    } else if (!user) {
      redirect('/auth/login')
    }
    return (
      <ThemeProvider>
        <DashboardLayout>{children}</DashboardLayout>
      </ThemeProvider>
    )
  } catch (err: unknown) {
    const digest = (err as Error & { digest?: string })?.digest ?? ''
    if (String(digest).startsWith('NEXT_REDIRECT')) throw err
    console.error('War room layout error:', err)
    redirect('/auth/login')
  }
}
