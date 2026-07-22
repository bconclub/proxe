'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../../../lib/supabase/client'
import { getBrandConfig } from '@/configs'

function AcceptInviteForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const brand = useMemo(() => getBrandConfig(), [])
  const colors = brand.colors
  const tagline = brand.tagline || brand.name
  const logoLetter = brand.name.charAt(0).toUpperCase()
  const logoImage = brand.chatStructure?.avatar?.source

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [invitation, setInvitation] = useState<any>(null)

  useEffect(() => {
    if (!token) {
      setError('Invalid invitation link')
      return
    }

    // Verify invitation token SERVER-SIDE. The old direct browser query on
    // user_invitations used the anon key — on brands whose RLS blocks anonymous
    // reads it failed and (because the spinner branch never rendered `error`)
    // the page hung on "Verifying invitation..." forever.
    const verifyInvitation = async () => {
      try {
        const res = await fetch(`/api/auth/redeem-invite?token=${encodeURIComponent(token)}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok || !data?.ok) {
          setError(data?.error || 'Invalid or expired invitation')
          return
        }
        setInvitation(data)
        setEmail(data.email)
      } catch {
        setError('Could not verify the invitation. Check your connection and reload this page.')
      }
    }

    verifyInvitation()
  }, [token])

  const handleAccept = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }

    setLoading(true)

    // ── Server-side redeem ───────────────────────────────────────────────
    // We POST to /api/auth/redeem-invite which:
    //   1. Validates the token (exists, not accepted, not expired)
    //   2. Uses the service-role admin API to create the user with
    //      email_confirm:true — so they can sign in immediately. Previously
    //      we did supabase.auth.signUp() in the browser which left users
    //      stranded on the login screen with "Please verify your email."
    //   3. Sets the dashboard_users role + marks invitation accepted
    //
    // After it returns success, we sign in with the password they just set
    // to establish the cookie session, then route to /dashboard.
    try {
      const res = await fetch('/api/auth/redeem-invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password, fullName }),
      })
      const payload = await res.json().catch(() => ({}))

      if (!res.ok) {
        setError(payload?.error || 'Could not accept invitation')
        setLoading(false)
        return
      }

      // Establish a session — the redeem endpoint just created the user
      // server-side; the browser still has no auth cookie. signInWithPassword
      // sets it via the supabase-ssr cookie handlers in middleware.
      const supabase = createClient()
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: invitation.email,
        password,
      })
      if (signInError) {
        // Highly unlikely (we just created/confirmed the user) but if it
        // happens, the account is fine — send them to login with the email
        // pre-filled.
        console.error('[accept-invite] signIn after redeem failed:', signInError)
        router.push('/auth/login')
        return
      }

      router.push('/dashboard')
      router.refresh()
    } catch (err: any) {
      console.error('[accept-invite] Redeem failed:', err)
      setError(err?.message || 'Could not accept invitation')
      setLoading(false)
    }
  }

  if (!token) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" style={{ backgroundColor: colors.primaryDark }}>
        <div className="text-center">
          <h2 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Invalid Invitation</h2>
          <p className="mt-2 text-gray-400">This invitation link is invalid.</p>
        </div>
      </div>
    )
  }

  if (!invitation) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: colors.primaryDark }}>
        <div className="text-center px-6">
          {error ? (
            <>
              <h2 className="text-2xl font-bold" style={{ color: colors.textPrimary }}>Invitation problem</h2>
              <p className="mt-2 text-gray-400 max-w-sm mx-auto">{error}</p>
              <p className="mt-3 text-sm text-gray-500">Ask your admin to send a fresh invite if this keeps happening.</p>
            </>
          ) : (
            <>
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: colors.primary }}></div>
              <p className="mt-4 text-gray-400">Verifying invitation...</p>
            </>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: colors.primaryDark }}>
      <div className="max-w-md w-full space-y-8">
        <div>
          <div className="text-center mb-4">
            {logoImage ? (
              <img src={logoImage} alt={brand.name} className="mx-auto w-16 h-16 rounded-full object-cover mb-4" />
            ) : (
              <div
                className="mx-auto w-16 h-16 flex items-center justify-center rounded-full font-bold text-2xl mb-4"
                style={{ backgroundColor: colors.primary, color: colors.primaryDark }}
              >
                {logoLetter}
              </div>
            )}
          </div>
          <h2 className="mt-6 text-center text-3xl font-extrabold" style={{ color: colors.textPrimary }}>
            Accept Invitation
          </h2>
          <p className="mt-2 text-center text-sm" style={{ color: colors.primary }}>
            {tagline}
          </p>
          <p className="mt-1 text-center text-sm text-gray-400">
            Create your account to access the dashboard
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleAccept}>
          {error && (
            <div className="rounded-md bg-red-50 p-4">
              <div className="text-sm text-red-800">{error}</div>
            </div>
          )}
          <div className="rounded-md shadow-sm space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium" style={{ color: colors.textSecondary }}>
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                required
                disabled
                className="mt-1 appearance-none relative block w-full px-3 py-2 border rounded-md sm:text-sm"
                style={{
                  backgroundColor: colors.bgHover,
                  borderColor: colors.borderAccent,
                  color: colors.textPrimary,
                }}
                value={email}
              />
            </div>
            <div>
              <label htmlFor="fullName" className="block text-sm font-medium" style={{ color: colors.textSecondary }}>
                Full Name
              </label>
              <input
                id="fullName"
                name="fullName"
                type="text"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border rounded-md sm:text-sm"
                style={{
                  backgroundColor: colors.primaryDark,
                  borderColor: colors.borderAccent,
                  color: colors.textPrimary,
                }}
                placeholder="Enter your full name"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="password" className="block text-sm font-medium" style={{ color: colors.textSecondary }}>
                Password
              </label>
              <input
                id="password"
                name="password"
                type="password"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border rounded-md sm:text-sm"
                style={{
                  backgroundColor: colors.primaryDark,
                  borderColor: colors.borderAccent,
                  color: colors.textPrimary,
                }}
                placeholder="Enter password (min 6 characters)"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium" style={{ color: colors.textSecondary }}>
                Confirm Password
              </label>
              <input
                id="confirmPassword"
                name="confirmPassword"
                type="password"
                required
                className="mt-1 appearance-none relative block w-full px-3 py-2 border rounded-md sm:text-sm"
                style={{
                  backgroundColor: colors.primaryDark,
                  borderColor: colors.borderAccent,
                  color: colors.textPrimary,
                }}
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>

          <div>
            <button
              type="submit"
              disabled={loading}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                backgroundColor: colors.primary,
                color: colors.primaryDark,
              }}
            >
              {loading ? 'Creating account...' : 'Accept Invitation & Sign Up'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function AcceptInvitePage() {
  // Use a simple loading state - brand colors applied by inner component
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-400 mx-auto"></div>
          <p className="mt-4 text-gray-400">Loading...</p>
        </div>
      </div>
    }>
      <AcceptInviteForm />
    </Suspense>
  )
}
