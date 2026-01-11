// AUTHENTICATION DISABLED
// import { redirect } from 'next/navigation'
// import { createClient } from '@/lib/supabase/server'
import InsightsCharts from '@/components/dashboard/InsightsCharts'
import LeadsTable from '@/components/dashboard/LeadsTable'
import RecentBookings from '@/components/dashboard/RecentBookings'

export default async function DashboardPage() {
  try {
    // AUTHENTICATION DISABLED - Dashboard is now public access
    // const supabase = await createClient()
    // const {
    //   data: { user },
    // } = await supabase.auth.getUser()

    // if (!user) {
    //   // Redirect handled by middleware, but just in case
    //   redirect('/auth/login')
    // }

    return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard Overview</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Welcome back! Here&apos;s what&apos;s happening with your leads and bookings.
        </p>
      </div>

      {/* Insights Charts */}
      <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] shadow rounded-lg p-6">
        <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Insights</h2>
        <InsightsCharts />
      </div>

      {/* Recent Leads - Row 1 */}
      <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Recent Leads</h2>
          <LeadsTable 
            limit={10} 
            hideFilters={true}
            showLimitSelector={true}
            showViewAll={true}
          />
        </div>
      </div>

      {/* Recent Conversations - Row 2 */}
      <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Recent Conversations</h2>
          <LeadsTable 
            limit={10} 
            hideFilters={true}
            showLimitSelector={true}
            showViewAll={true}
          />
        </div>
      </div>

      {/* Upcoming Events - Row 3 */}
      <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Upcoming Events</h2>
          <RecentBookings />
        </div>
      </div>
    </div>
    )
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
          <p className="text-sm text-red-600 dark:text-red-400 mt-2">
            Please check that the unified_leads view exists in your Supabase database.
          </p>
        </div>
      </div>
    )
  }
}

