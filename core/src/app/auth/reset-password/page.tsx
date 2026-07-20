'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase/client'
import { getBrandConfig } from '@/configs'

// ─────────────────────────────────────────────────────────────────────────────
// Password reset - landing page for the Supabase recovery link.
//
// Flow: login "Forgot password?" → resetPasswordForEmail(redirectTo:
// /auth/callback?next=/auth/reset-password) → Supabase emails a recovery link →
// user clicks → /auth/callback exchanges the code into a session cookie →
// redirects here. This page reads that recovery session and lets the user set a
// new password via updateUser(). Works for BOTH the PKCE (?code=) path (already
// exchanged by the callback route) and the implicit (#access_token) path
// (detectSessionInUrl on the browser client establishes it on mount).
// ─────────────────────────────────────────────────────────────────────────────

function ResetPasswordForm() {
  const router = useRouter()

  const brand = useMemo(() => getBrandConfig(), [])
  const colors = brand.colors
  const tagline = brand.tagline || brand.name
  const logoLetter = brand.name.charAt(0).toUpperCase()
  const logoImage = brand.chatStructure?.avatar?.source

  const [phase, setPhase] = useState<'checking' | 'ready' | 'invalid' | 'done'>('checking')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  // On mount, confirm a recovery session exists. The browser client
  // (detectSessionInUrl) resolves the token from the URL hash on the implicit
  // path; on the PKCE path the /auth/callback route already set the cookie.
  useEffect(() => {
    const supabase = createClient()

    // If the recovery arrives as an implicit #access_token, onAuthStateChange
    // fires PASSWORD_RECOVERY once the client parses the hash.
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session?.user && event === 'SIGNED_IN')) {
        setPhase('ready')
      }
    })

    const confirmSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user) {
          setPhase('ready')
        } else {
          // Give detectSessionInUrl a beat to parse an implicit-flow hash, then
          // re-check once before declaring the link invalid/expired.
          setTimeout(async () => {
            const { data: { session: s2 } } = await supabase.auth.getSession()
            setPhase(s2?.user ? 'ready' : 'invalid')
          }, 1200)
        }
      } catch {
        setPhase('invalid')
      }
    }
    confirmSession()

    return () => { sub.subscription.unsubscribe() }
  }, [])

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (password.length < 6) {
      setError('Password must be at least 6 characters')
      return
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match')
      return
    }

    setLoading(true)
    try {
      const supabase = createClient()
      const { error: updateError } = await supabase.auth.updateUser({ password })
      if (updateError) {
        setError(updateError.message || 'Could not update password')
        setLoading(false)
        return
      }
      setPhase('done')
      // A full navigation flushes the refreshed session cleanly into cookies.
      setTimeout(() => { window.location.href = '/dashboard' }, 1400)
    } catch (err: any) {
      console.error('[reset-password] update failed:', err)
      setError(err?.message || 'Could not update password')
      setLoading(false)
    }
  }

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8" style={{ backgroundColor: colors.primaryDark }}>
      <div className="max-w-md w-full space-y-8">
        <div className="text-center">
          {logoImage ? (
            <img src={logoImage} alt={brand.name} className="mx-auto w-16 h-16 rounded-full object-cover mb-4" />
          ) : (
            <div className="mx-auto w-16 h-16 flex items-center justify-center rounded-full font-bold text-2xl mb-4" style={{ backgroundColor: colors.primary, color: colors.primaryDark }}>
              {logoLetter}
            </div>
          )}
          <h2 className="text-3xl font-extrabold" style={{ color: colors.textPrimary }}>Reset password</h2>
          <p className="mt-2 text-sm" style={{ color: colors.primary }}>{tagline}</p>
        </div>
        {children}
      </div>
    </div>
  )

  if (phase === 'checking') {
    return shell(
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: colors.primary }} />
        <p className="mt-4 text-sm text-gray-400">Verifying your reset link…</p>
      </div>
    )
  }

  if (phase === 'invalid') {
    return shell(
      <div className="text-center space-y-4">
        <p className="text-sm text-gray-400">
          This reset link is invalid or has expired. Request a new one from the login page.
        </p>
        <button
          onClick={() => router.push('/auth/login')}
          className="w-full py-2 px-4 rounded-md text-sm font-medium"
          style={{ backgroundColor: colors.primary, color: colors.primaryDark }}
        >
          Back to login
        </button>
      </div>
    )
  }

  if (phase === 'done') {
    return shell(
      <div className="text-center">
        <p className="text-sm" style={{ color: colors.primary }}>Password updated. Signing you in…</p>
      </div>
    )
  }

  // phase === 'ready'
  return shell(
    <form className="mt-8 space-y-6" onSubmit={handleReset}>
      <p className="text-center text-sm text-gray-400">Choose a new password for your account.</p>
      {error && (
        <div className="rounded-md bg-red-50 p-4">
          <div className="text-sm text-red-800">{error}</div>
        </div>
      )}
      <div className="space-y-4">
        <div>
          <label htmlFor="password" className="block text-sm font-medium" style={{ color: colors.textSecondary }}>New password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            className="mt-1 appearance-none relative block w-full px-3 py-2 border rounded-md sm:text-sm"
            style={{ backgroundColor: colors.primaryDark, borderColor: colors.borderAccent, color: colors.textPrimary }}
            placeholder="Enter new password (min 6 characters)"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium" style={{ color: colors.textSecondary }}>Confirm password</label>
          <input
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            required
            className="mt-1 appearance-none relative block w-full px-3 py-2 border rounded-md sm:text-sm"
            style={{ backgroundColor: colors.primaryDark, borderColor: colors.borderAccent, color: colors.textPrimary }}
            placeholder="Confirm new password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
          />
        </div>
      </div>
      <button
        type="submit"
        disabled={loading}
        className="w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ backgroundColor: colors.primary, color: colors.primaryDark }}
      >
        {loading ? 'Updating…' : 'Update password'}
      </button>
    </form>
  )
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-gray-400 mx-auto" />
          <p className="mt-4 text-gray-400">Loading…</p>
        </div>
      </div>
    }>
      <ResetPasswordForm />
    </Suspense>
  )
}
