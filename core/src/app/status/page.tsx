import { redirect } from 'next/navigation'

/**
 * /status - legacy route. Redirect to /dashboard/status which has the
 * real health monitoring + HealthStrip + EndpointHealthDetail.
 *
 * The previous implementation lived here, had bit-rot (rendered
 * "[object Object]" in the TOTAL LEADS card because the metrics endpoint
 * shape changed), and showed stale "GO LIVE SPRINT" copy from Apr 7.
 * Replaced with a redirect - single source of truth at /dashboard/status.
 */
export default function StatusPageRedirect() {
  redirect('/dashboard/status')
}
