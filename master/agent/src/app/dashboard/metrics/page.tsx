import MetricsDashboard from '@/components/dashboard/MetricsDashboard'

export default function MetricsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Metrics & Analytics</h1>
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
          Detailed analytics and performance metrics.
        </p>
      </div>

      <MetricsDashboard detailed />
    </div>
  )
}


