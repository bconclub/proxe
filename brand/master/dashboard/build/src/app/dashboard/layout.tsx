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
  // AUTH BYPASSED: Allow access without authentication
  console.warn('⚠️ AUTH BYPASSED: Master dashboard allowing access without login')
  return (
    <ThemeProvider>
      <DashboardLayout>{children}</DashboardLayout>
    </ThemeProvider>
  )

  // COMMENTED OUT: Original auth check
  // try {
  //   const supabase = await createClient()
  //   const {
  //     data: { user },
  //     error,
  //   } = await supabase.auth.getUser()

  //   // Debug logging
  //   if (process.env.NODE_ENV === 'development') {
  //     console.log('🔍 Dashboard layout auth check:', {
  //       hasUser: !!user,
  //       userEmail: user?.email,
  //       error: error?.message,
  //       errorStatus: (error as any)?.status,
  //       willRedirect: !user && (error || !error),
  //     })
      
  //     // Log if we're about to redirect
  //     if (!user) {
  //       console.warn('⚠️ Dashboard layout: About to redirect to login because:', {
  //         hasError: !!error,
  //         errorMessage: error?.message,
  //         errorStatus: (error as any)?.status,
  //       })
  //     }
  //   }

  //   // Handle errors gracefully
  //   if (error) {
  //     const errorStatus = (error as any)?.status
      
  //     // Rate limit - allow access but log warning
  //     if (errorStatus === 429) {
  //       console.warn('🚫 Dashboard layout: Rate limited, allowing access with degraded experience')
  //       // Continue - allow access even if rate limited
  //     } 
  //     // Invalid session or unauthorized - redirect to login
  //     else if (errorStatus === 400 || errorStatus === 401) {
  //       console.warn('🚫 Dashboard layout: Invalid session, redirecting to login')
  //       redirect('/auth/login')
  //     }
  //     // Other errors - log but don't block in development
  //     else if (process.env.NODE_ENV === 'development') {
  //       console.warn('⚠️ Dashboard layout: Auth error but allowing in dev mode:', error.message)
  //     } else {
  //       // In production, redirect on auth errors
  //       console.warn('🚫 Dashboard layout: Auth error, redirecting to login')
  //       redirect('/auth/login')
  //     }
  //   }

  //   // If no user and no error, redirect to login
  //   if (!user && !error) {
  //     console.warn('🚫 Dashboard layout: No user found, redirecting to login')
  //     redirect('/auth/login')
  //   }

  //   // User is authenticated, render dashboard
  //   return (
  //     <ThemeProvider>
  //       <DashboardLayout>{children}</DashboardLayout>
  //     </ThemeProvider>
  //   )
  // } catch (error) {
  //   console.error('Dashboard layout error:', error)
  //   // On unexpected errors, redirect to login
  //   redirect('/auth/login')
  // }
}


