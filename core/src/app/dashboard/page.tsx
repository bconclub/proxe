import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import FounderDashboard from '@/components/dashboard/FounderDashboard'

export default async function DashboardPage() {
  try {
    // Auth check is handled in layout, but double-check here
    const supabase = await createClient()
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error || !user) {
      // Redirect handled by middleware/layout, but just in case
      redirect('/auth/login')
    }

    return <FounderDashboard />
  } catch (error) {
    console.error('Dashboard page error:', error)
    return (
      <div className="space-y-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">
            Dashboard Error
          </h2>
          <p className="text-red-700 dark:text-red-300">
            {error instanceof Error ? error.message : 'An error occurred loading the dashboard.'}
          </p>
        </div>
      </div>
    )
  }
}
