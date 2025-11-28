import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import MetricsDashboard from '@/components/dashboard/MetricsDashboard'
import LeadsTable from '@/components/dashboard/LeadsTable'
import BookingsCalendar from '@/components/dashboard/BookingsCalendar'
import { 
  MdLanguage,
  MdWhatsapp,
  MdPhone,
  MdVideoLibrary,
} from 'react-icons/md'

export default async function DashboardPage() {
  try {
    const supabase = await createClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      // Redirect handled by middleware, but just in case
      redirect('/auth/login')
    }

    return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard Overview</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Welcome back! Here&apos;s what&apos;s happening with your leads and bookings.
        </p>
      </div>

      {/* Metrics Cards */}
      <MetricsDashboard />

      {/* Channel Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        <a href="/dashboard/channels/web" className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] shadow rounded-lg p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Web PROXe</h3>
            </div>
            <div className="w-12 h-12 flex items-center justify-center text-gray-600 dark:text-gray-400">
              <MdLanguage size={48} color="currentColor" />
            </div>
          </div>
        </a>
        <a href="/dashboard/channels/whatsapp" className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] shadow rounded-lg p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">WhatsApp PROXe</h3>
            </div>
            <div className="w-12 h-12 flex items-center justify-center text-gray-600 dark:text-gray-400">
              <MdWhatsapp size={48} color="currentColor" />
            </div>
          </div>
        </a>
        <a href="/dashboard/channels/voice" className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] shadow rounded-lg p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Voice PROXe</h3>
            </div>
            <div className="w-12 h-12 flex items-center justify-center text-gray-600 dark:text-gray-400">
              <MdPhone size={48} color="currentColor" />
            </div>
          </div>
        </a>
        <a href="/dashboard/channels/social" className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] shadow rounded-lg p-6 hover:shadow-lg transition-shadow">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900 dark:text-white">Social PROXe</h3>
            </div>
            <div className="w-12 h-12 flex items-center justify-center text-gray-600 dark:text-gray-400">
              <MdVideoLibrary size={48} color="currentColor" />
            </div>
          </div>
        </a>
      </div>

      {/* Recent Conversations */}
      <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Recent Conversations</h2>
          <LeadsTable limit={10} />
        </div>
      </div>

      {/* Bookings Calendar */}
      <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-medium text-gray-900 dark:text-white">Bookings Calendar</h2>
            <a
              href="/dashboard/bookings"
              className="text-sm text-primary-600 dark:text-primary-400 hover:underline"
            >
              View Full Calendar →
            </a>
          </div>
          <div className="h-[700px]">
            <BookingsCalendar view="calendar" />
          </div>
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

