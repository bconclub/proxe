export default function AudiencePage() {
  return (
    <div className="relative min-h-[600px] flex items-center justify-center">
      {/* Blurred Background Content */}
      <div className="absolute inset-0 space-y-6 opacity-30 blur-sm pointer-events-none">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Audience</h1>
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Manage and segment your audience for targeted campaigns.
          </p>
        </div>
        <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] shadow rounded-lg p-6">
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-4">Segments</h2>
          <div className="h-32 bg-gray-100 dark:bg-gray-800 rounded"></div>
        </div>
        <div className="bg-white dark:bg-[#1A1A1A] border border-gray-200 dark:border-[#262626] shadow rounded-lg p-6">
          <div className="h-64 bg-gray-100 dark:bg-gray-800 rounded"></div>
        </div>
      </div>

      {/* Coming Soon Overlay */}
      <div className="relative z-10 text-center">
        <div className="inline-block px-8 py-6 rounded-lg border-2 border-dashed" style={{
          backgroundColor: 'var(--bg-secondary)',
          borderColor: 'var(--border-primary)',
        }}>
          <h2 className="text-2xl font-bold mb-2" style={{ color: 'var(--text-primary)' }}>
            Coming Soon
          </h2>
          <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            Audience management features are under development
          </p>
        </div>
      </div>
    </div>
  )
}


