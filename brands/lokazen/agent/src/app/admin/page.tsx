import { redirect } from 'next/navigation'

// TODO: Re-enable auth before production
// AUTHENTICATION DISABLED - Temporarily disabled for development
// This route redirects to dashboard without authentication check

export default async function AdminPage() {
  // TODO: Re-enable auth before production
  // AUTHENTICATION DISABLED - Redirect directly to dashboard
  redirect('/dashboard')
}
