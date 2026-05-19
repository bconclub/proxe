'use client'

import { useState, useEffect, useMemo } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '../../../lib/supabase/client'
import { getBrandConfig, BRAND_ID } from '@/configs'

/** Brand website URLs */
const brandWebsites: Record<string, string> = {
  windchasers: 'https://windchasers.in',
  bcon: 'https://bconclub.com',
  proxe: 'https://proxe.ai',
}

/** Brand taglines for login subtitle */
const brandTaglines: Record<string, string> = {
  windchasers: 'WindChasers Aviation Academy',
  bcon: 'BCON Club',
  proxe: 'PROXe AI Platform',
}

export default function LoginPage() {
  const router = useRouter()

  // Brand config - resolved from env var or hostname detection
  const brand = useMemo(() => getBrandConfig(), [])
  const brandId = (brand.brand || BRAND_ID).toLowerCase()
  const colors = brand.colors
  const tagline = brandTaglines[brandId] || brand.name
  const website = brandWebsites[brandId] || '#'
  const logoLetter = brand.name.charAt(0).toUpperCase()
  const logoImage = brand.chatStructure?.avatar?.source

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  // Start false on both server and client to avoid hydration mismatch.
  // The first useEffect below sets the real value instantly on mount.
  const [darkMode, setDarkMode] = useState(false)
  const [checking, setChecking] = useState(true) // hide form until session check done
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastAttemptTime, setLastAttemptTime] = useState<number | null>(null)
  const [attemptCount, setAttemptCount] = useState(0)
  const [rateLimited, setRateLimited] = useState(false)
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null)
  const [rateLimitCountdown, setRateLimitCountdown] = useState<number | null>(null)

  // Effect 1: resolve dark mode from storage on mount (runs once, client-only)
  useEffect(() => {
    const saved = localStorage.getItem('theme')
    const prefersDark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches
    setDarkMode(prefersDark)
    if (prefersDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }

    // Also restore any persisted rate-limit state
    const savedRateLimit = localStorage.getItem('rateLimitUntil')
    if (savedRateLimit) {
      const until = parseInt(savedRateLimit)
      if (Date.now() < until) {
        setRateLimited(true)
        setRateLimitUntil(until)
      } else {
        localStorage.removeItem('rateLimitUntil')
      }
    }
  }, [])

  // Effect 2: keep the <html> class in sync when darkMode is toggled manually
  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [darkMode])

  // Effect 3: check for an existing session once; hide form until resolved
  useEffect(() => {
    const checkExistingSession = async () => {
      try {
        const supabase = createClient()
        const { data: { session } } = await supabase.auth.getSession()
        if (session?.user && session?.access_token) {
          router.replace('/dashboard')
          return // stay checking=true while redirect fires; component unmounts
        }
      } catch {}
      setChecking(false) // no session → show the form
    }
    checkExistingSession()
  }, [router])

  // Countdown timer for rate limit
  useEffect(() => {
    if (!rateLimitUntil) {
      setRateLimitCountdown(null)
      return
    }

    const updateCountdown = () => {
      const now = Date.now()
      const remaining = Math.max(0, rateLimitUntil - now)

      if (remaining > 0) {
        setRateLimitCountdown(Math.ceil(remaining / 1000))
      } else {
        setRateLimited(false)
        setRateLimitUntil(null)
        setRateLimitCountdown(null)
        localStorage.removeItem('rateLimitUntil')
      }
    }

    updateCountdown()
    const interval = setInterval(updateCountdown, 1000)
    return () => clearInterval(interval)
  }, [rateLimitUntil])

  const toggleDarkMode = () => {
    const newMode = !darkMode
    setDarkMode(newMode)
    localStorage.setItem('theme', newMode ? 'dark' : 'light')
    if (newMode) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    // Browser autofill (Chrome, Safari, etc.) doesn't always fire React's
    // onChange handler on controlled inputs. Read directly from the DOM so
    // autofilled credentials are captured even when React state is still empty.
    const emailEl = document.getElementById('email') as HTMLInputElement | null
    const passwordEl = document.getElementById('password') as HTMLInputElement | null
    const emailValue = emailEl?.value?.trim() || email
    const passwordValue = passwordEl?.value || password

    // Sync state in case autofill populated the DOM but not state
    if (emailValue && !email) setEmail(emailValue)
    if (passwordValue && !password) setPassword(passwordValue)

    if (!emailValue || !passwordValue) {
      setError('Please enter your email and password.')
      return
    }

    // Check if we're still rate limited
    const now = Date.now()
    if (rateLimitUntil && now < rateLimitUntil) {
      const minutesLeft = Math.ceil((rateLimitUntil - now) / 60000)
      setError(`Rate limited. Please wait ${minutesLeft} minute${minutesLeft > 1 ? 's' : ''} before trying again.`)
      return
    }

    // Reset rate limit if time has passed
    if (rateLimitUntil && now >= rateLimitUntil) {
      setRateLimited(false)
      setRateLimitUntil(null)
      setAttemptCount(0)
      localStorage.removeItem('rateLimitUntil')
    }

    setLastAttemptTime(now)
    setLoading(true)

    try {
      const supabase = createClient()

      const { data, error } = await supabase.auth.signInWithPassword({
        email: emailValue,
        password: passwordValue,
      })

      if (error) {
        console.error('❌ Supabase Auth Error:', {
          message: error.message,
          status: (error as any).status,
          name: error.name,
        })

        // Check for rate limit errors (429 status)
        const isRateLimit =
          error.message.includes('rate limit') ||
          error.message.includes('too many') ||
          error.message.includes('429') ||
          (error as any).status === 429

        if (isRateLimit) {
          const limitUntil = now + 60 * 1000 // 60s cooldown
          setRateLimited(true)
          setRateLimitUntil(limitUntil)
          localStorage.setItem('rateLimitUntil', limitUntil.toString())
          setError('Too many attempts. Please wait 60 seconds before trying again.')

          setTimeout(() => {
            setRateLimited(false)
            setRateLimitUntil(null)
            setAttemptCount(0)
            localStorage.removeItem('rateLimitUntil')
          }, 60 * 1000)
        } else if (error.message.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please check your credentials and try again.')
          setAttemptCount(prev => prev + 1)
        } else if (error.message.includes('Email not confirmed')) {
          setError('Please verify your email address before signing in.')
        } else {
          setError(error.message)
        }

        setLoading(false)
      } else {
        // Reset rate-limit counters on success
        setAttemptCount(0)
        setLastAttemptTime(null)
        setRateLimited(false)
        setRateLimitUntil(null)

        if (data?.user && data?.session) {
          console.log('✅ Login successful, user:', data.user.email)
          // createBrowserClient automatically wrote the session to cookies —
          // the server-side createServerClient will see it on the next request.
          // A full page navigation flushes the in-flight React state cleanly.
          window.location.href = '/dashboard'
        } else {
          console.error('❌ Login successful but session not available')
          setError('Login successful but session not established. Please try again.')
          setLoading(false)
        }
      }
    } catch (err) {
      console.error('Login error:', err)
      setError('An unexpected error occurred. Please try again later.')
      setLoading(false)
    }
  }

  // Don't render anything until we've confirmed there's no active session.
  // This prevents the login form from flashing before the redirect fires.
  if (checking) return null

  return (
    <div
      className="login-page min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8"
      style={{ backgroundColor: darkMode ? colors.primaryDark : '#f6f6f6' }}
    >
      {/* Dark Mode Toggle */}
      <button
        onClick={toggleDarkMode}
        className="login-page-theme-toggle fixed top-4 right-4 p-2 rounded-full transition-colors"
        style={darkMode ? {
          backgroundColor: colors.bgHover,
          color: colors.textPrimary,
          border: `1px solid ${colors.borderAccent}`,
        } : {
          backgroundColor: '#ececec',
          color: '#000',
          border: '1px solid #d0d0d0',
        }}
        aria-label="Toggle dark mode"
      >
        {darkMode ? '☀️' : '🌙'}
      </button>

      <div
        className="login-page-card max-w-md w-full rounded-2xl shadow-xl p-8"
        style={darkMode ? {
          backgroundColor: colors.primaryDark,
          border: `1px solid ${colors.borderAccent}`,
        } : {
          backgroundColor: '#ffffff',
          border: '2px solid #d0d0d0',
        }}
      >
        <div className="login-page-card-content space-y-8">
          {/* Logo and Title */}
          <div className="login-page-header text-center">
            <div className="login-page-logo-container mx-auto w-16 h-16 mb-4 flex items-center justify-center">
              {logoImage ? (
                <img
                  src={logoImage}
                  alt={brand.name}
                  className="w-full h-full rounded-full object-cover"
                />
              ) : (
                <div
                  className="login-page-logo w-full h-full flex items-center justify-center rounded-full font-bold text-2xl"
                  style={{
                    backgroundColor: colors.primary,
                    color: colors.primaryDark,
                  }}
                >
                  {logoLetter}
                </div>
              )}
            </div>
            <h2
              className="login-page-title text-3xl font-normal"
              style={{ color: darkMode ? colors.textPrimary : '#000' }}
            >
              Sign in
            </h2>
            <p
              className="login-page-subtitle mt-2 text-sm"
              style={{ color: darkMode ? colors.primary : colors.primaryVibrant }}
            >
              {tagline}
            </p>
          </div>

            {/* Error Message */}
            {error && (
              <div className={`login-page-error-message rounded-lg p-4 border ${
                darkMode
                  ? 'border-red-500/50'
                  : 'bg-red-50 border-red-200'
              }`}
              style={darkMode ? { backgroundColor: colors.primaryDark } : undefined}
              >
                <div className={`login-page-error-content text-sm flex items-start gap-2 ${
                  darkMode ? 'text-red-400' : 'text-red-600'
                }`}>
                  <span className="login-page-error-icon flex-shrink-0">⚠️</span>
                  <div className="login-page-error-text flex-1">
                    <div className="login-page-error-message-text">{error}</div>
                    {rateLimited && rateLimitCountdown !== null && (
                      <div className={`login-page-error-countdown mt-2 text-xs font-medium ${
                        darkMode ? 'text-red-300' : 'text-red-700'
                      }`}>
                        Time remaining: {Math.floor(rateLimitCountdown / 60)}:{(rateLimitCountdown % 60).toString().padStart(2, '0')}
                      </div>
                    )}
                  </div>
                </div>
                {(error.includes('wait') || error.includes('Rate limited') || error.includes('attempts')) && (
                  <div className={`login-page-error-tip mt-2 text-xs flex items-center gap-2 ${
                    darkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    💡 <strong>Tip:</strong> Please wait before trying again.
                    <button
                      type="button"
                      className="underline hover:no-underline ml-1"
                      style={{ color: colors.primary }}
                      onClick={() => {
                        localStorage.removeItem('rateLimitUntil')
                        setRateLimited(false)
                        setRateLimitUntil(null)
                        setRateLimitCountdown(null)
                        setAttemptCount(0)
                        setError(null)
                      }}
                    >
                      Clear &amp; retry
                    </button>
                  </div>
                )}
              </div>
            )}

          {/* Login Form */}
          <form className="login-page-form space-y-5" onSubmit={handleLogin}>
            {/* Email Field */}
            <div className="login-page-form-field">
              <label
                htmlFor="email"
                className="login-page-form-label block text-sm font-medium mb-2"
                style={{ color: darkMode ? '#d1d5db' : '#374151' }}
              >
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className="login-page-form-input-email w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 transition-colors"
                style={darkMode ? {
                  backgroundColor: colors.primaryDark,
                  borderColor: colors.borderAccent,
                  color: colors.textPrimary,
                  // @ts-ignore -- focus styles handled below
                  '--tw-ring-color': colors.primary,
                } as React.CSSProperties : {
                  backgroundColor: '#ffffff',
                  borderColor: '#d0d0d0',
                  color: '#000',
                  '--tw-ring-color': colors.primary,
                } as React.CSSProperties}
                placeholder="email@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                suppressHydrationWarning
                onFocus={(e) => {
                  e.target.style.borderColor = colors.primary
                  e.target.style.boxShadow = `0 0 0 2px ${colors.primary}40`
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = darkMode ? colors.borderAccent : '#d0d0d0'
                  e.target.style.boxShadow = 'none'
                }}
              />
            </div>

            {/* Password Field */}
            <div className="login-page-form-field">
              <label
                htmlFor="password"
                className="login-page-form-label block text-sm font-medium mb-2"
                style={{ color: darkMode ? '#d1d5db' : '#374151' }}
              >
                Password
              </label>
              <div className="login-page-form-password-container relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className="login-page-form-input-password w-full px-4 py-3 pr-12 rounded-lg border focus:outline-none focus:ring-2 transition-colors"
                  style={darkMode ? {
                    backgroundColor: colors.primaryDark,
                    borderColor: colors.borderAccent,
                    color: colors.textPrimary,
                  } : {
                    backgroundColor: '#ffffff',
                    borderColor: '#d0d0d0',
                    color: '#000',
                  }}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  suppressHydrationWarning
                  onFocus={(e) => {
                    e.target.style.borderColor = colors.primary
                    e.target.style.boxShadow = `0 0 0 2px ${colors.primary}40`
                  }}
                  onBlur={(e) => {
                    e.target.style.borderColor = darkMode ? colors.borderAccent : '#d0d0d0'
                    e.target.style.boxShadow = 'none'
                  }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className={`login-page-form-password-toggle absolute right-3 top-1/2 -translate-y-1/2 ${
                    darkMode ? 'text-gray-500 hover:text-gray-400' : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {showPassword ? '👁️' : '👁️‍🗨️'}
                </button>
              </div>
            </div>

            {/* Login Button */}
            <button
              type="submit"
              disabled={loading || rateLimited}
              className="login-page-form-submit-button w-full py-3 px-4 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2"
              style={{
                backgroundColor: colors.primary,
                color: colors.primaryDark,
                // @ts-ignore
                '--tw-ring-color': colors.primary,
              } as React.CSSProperties}
              onMouseEnter={(e) => {
                if (!loading && !rateLimited) {
                  (e.target as HTMLButtonElement).style.backgroundColor = colors.primaryVibrant
                }
              }}
              onMouseLeave={(e) => {
                (e.target as HTMLButtonElement).style.backgroundColor = colors.primary
              }}
            >
              {rateLimited
                ? 'Rate Limited - Please Wait'
                : loading
                  ? 'Signing in...'
                  : 'Log in'}
            </button>
          </form>

          {/* Footer */}
          <div className="login-page-footer text-center">
            <p className="login-page-footer-text text-xs text-gray-500">
              New? Visit{' '}
              <a
                href={website}
                target="_blank"
                rel="noopener noreferrer"
                className="login-page-footer-link hover:underline"
                style={{ color: darkMode ? colors.primary : colors.primaryVibrant }}
              >
                {tagline}
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
