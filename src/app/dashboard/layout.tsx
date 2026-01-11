// AUTHENTICATION DISABLED
// import { redirect } from 'next/navigation'
// import { createClient } from '@/lib/supabase/server'
import DashboardLayout from '@/components/dashboard/DashboardLayout'
import ThemeProvider from '@/components/dashboard/ThemeProvider'

export const dynamic = 'force-dynamic'

export default async function Layout({
  children,
}: {
  children: React.ReactNode
}) {
  // AUTHENTICATION DISABLED - Dashboard is now public access
  // const supabase = await createClient()
  // const {
  //   data: { user },
  //   error,
  // } = await supabase.auth.getUser()

  // // Debug logging
  // if (process.env.NODE_ENV === 'development') {
  //   console.log('🔍 Dashboard layout auth check:', {
  //     hasUser: !!user,
  //     hasSession: !!session,
  //     userEmail: user?.email,
  //     error: error?.message,
  //     errorStatus: (error as any)?.status,
  //   })
  // }

  // // If we have a session but getUser failed, wait a moment and retry
  // // This handles the case where cookies are being synced
  // if (session && !user && !error) {
  //   console.log('⚠️ Dashboard layout: Session exists but user not found, waiting...')
  //   // Wait a bit for cookies to sync
  //   await new Promise(resolve => setTimeout(resolve, 100))
  //   const retry = await supabase.auth.getUser()
  //   if (retry.data?.user) {
  //     // User found on retry, continue
  //     return (
  //       <ThemeProvider>
  //         <DashboardLayout>{children}</DashboardLayout>
  //       </ThemeProvider>
  //     )
  //   }
  // }

  // // Handle rate limit errors - don't redirect, just show error
  // if (error) {
  //   const errorStatus = (error as any).status
  //   if (errorStatus === 429) {
  //     console.warn('🚫 Dashboard layout: Rate limited, allowing access with degraded experience')
  //     // Allow access but user might have limited functionality
  //   } else if (errorStatus === 400) {
  //     // Invalid session - redirect to login
  //     console.warn('🚫 Dashboard layout: Invalid session (400), redirecting to login')
  //     redirect('/auth/login')
  //   } else if (!user && !session) {
  //     // Only redirect if we have neither user nor session
  //     console.warn('🚫 Dashboard layout: No user and no session, redirecting to login')
  //     redirect('/auth/login')
  //   }
  // }

  // // Only redirect if we have no user AND no session AND it's not a rate limit
  // // Give it a moment - cookies might still be syncing
  // if (!user && !session && !error) {
  //   // In development, log but don't redirect immediately
  //   // The client-side will handle the redirect if needed
  //   if (process.env.NODE_ENV === 'development') {
  //     console.warn('⚠️ Dashboard layout: No user, no session - but allowing access (client will check)')
  //     // Don't redirect - let client-side handle it
  //   } else {
  //     console.warn('🚫 Dashboard layout: No user, no session, and no error, redirecting to login')
  //     redirect('/auth/login')
  //   }
  // }

  return (
    <ThemeProvider>
      <DashboardLayout>{children}</DashboardLayout>
    </ThemeProvider>
  )
  
  // OLD ERROR HANDLING (commented out)
  // } catch (error) {
  //   console.error('Dashboard layout error:', error)
  //   // Don't redirect on rate limit errors
  //   const errorMessage = error instanceof Error ? error.message : String(error)
  //   if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
  //     console.warn('🚫 Dashboard layout: Rate limit error, allowing access')
  //     return (
  //       <ThemeProvider>
  //         <DashboardLayout>{children}</DashboardLayout>
  //       </ThemeProvider>
  //     )
  //   }
  //   redirect('/auth/login')
  // }
}


