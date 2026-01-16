import WhatsAppMetrics from '@/components/dashboard/WhatsAppMetrics'
import LeadsTable from '@/components/dashboard/LeadsTable'

export default function WhatsAppPROXePage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">WhatsApp PROXe</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Monitor and manage leads from WhatsApp conversations.
        </p>
      </div>

      {/* WhatsApp Metrics */}
      <WhatsAppMetrics />

      {/* Channel-specific leads */}
      <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] shadow rounded-lg">
        <div className="px-4 py-5 sm:p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">WhatsApp Leads</h2>
          <LeadsTable sourceFilter="whatsapp" />
        </div>
      </div>
    </div>
  )
}


