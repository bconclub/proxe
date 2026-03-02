'use client'

import { useState, useEffect, useMemo, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createClient } from '../../../lib/supabase/client'
import { getBrandConfig } from '@/configs'

/** Brand taglines */
const brandTaglines: Record<string, string> = {
  windchasers: 'WindChasers Aviation Academy',
  bcon: 'BCON Club',
  proxe: 'PROXe AI Platform',
}

function AcceptInviteForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const token = searchParams.get('token')

  const brand = useMemo(() => getBrandConfig(), [])
  const brandId = (brand.brand || 'bcon').toLowerCase()
  const colors = brand.colors
  const tagline = brandTaglines[brandId] || brand.name
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

    // Verify invitation token
    const verifyInvitation = async () => {
      const supabase = createClient()
      const { data, error } = await supabase
        .from('user_invitations')
        .select('*')
        .eq('token', token)
        .single()

      if (error || !data) {
        setError('Invalid or expired invitation')
        return
      }

      const invitationData = data as {
        id: string
        email: string
        token: string
        role: string
        accepted_at: string | null
        expires_at: string
        created_at: string
      }

      if (invitationData.accepted_at) {
        setError('This invitation has already been accepted')
        return
      }

      if (new Date(invitationData.expires_at) < new Date()) {
        setError('This invitation has expired')
        return
      }

      setInvitation(invitationData)
      setEmail(invitationData.email)
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

    const supabase = createClient()

    const { data: authData, error: signUpError } = await supabase.auth.signUp({
      email: invitation.email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    })

    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }

    // Mark invitation as accepted
    if (authData.user) {
      const { error: updateError } = await (supabase as any)
        .from('user_invitations')
        .update({ accepted_at: new Date().toISOString() })
        .eq('token', token)

      if (updateError) {
        console.error('Error updating invitation:', updateError)
      }

      const { error: roleError } = await (supabase as any)
        .from('dashboard_users')
        .update({ role: invitation.role })
        .eq('id', authData.user.id)

      if (roleError) {
        console.error('Error updating role:', roleError)
      }
    }

    router.push('/dashboard')
    router.refresh()
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
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 mx-auto" style={{ borderColor: colors.primary }}></div>
          <p className="mt-4 text-gray-400">Verifying invitation...</p>
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
  // Use a simple loading state — brand colors applied by inner component
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
