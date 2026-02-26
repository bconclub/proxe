'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { createClient } from '../../../lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [darkMode, setDarkMode] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [lastAttemptTime, setLastAttemptTime] = useState<number | null>(null)
  const [attemptCount, setAttemptCount] = useState(0)
  const [rateLimited, setRateLimited] = useState(false)
  const [rateLimitUntil, setRateLimitUntil] = useState<number | null>(null)
  const [rateLimitCountdown, setRateLimitCountdown] = useState<number | null>(null)

  useEffect(() => {
    // Check system preference or saved preference
    const savedTheme = localStorage.getItem('theme')
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches
    const shouldBeDark = savedTheme ? savedTheme === 'dark' : prefersDark
    setDarkMode(shouldBeDark)
    if (shouldBeDark) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }

    // Check for saved rate limit state
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

    // Check if user is already logged in and redirect to dashboard
    const checkExistingSession = async () => {
      try {
        const supabase = createClient()
        const { data: { user }, error } = await supabase.auth.getUser()
        
        if (user && !error) {
          // User is already authenticated, redirect to dashboard
          console.log('✅ User already logged in, redirecting to dashboard')
          router.push('/dashboard')
          router.refresh()
        }
      } catch (err) {
        // If check fails, user is not logged in - stay on login page
        console.log('ℹ️ No existing session found, staying on login page')
      }
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
        setRateLimitCountdown(Math.ceil(remaining / 1000)) // seconds
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
    }
    
    // Client-side rate limiting: prevent too many rapid attempts
    if (lastAttemptTime && now - lastAttemptTime < 3000) {
      setError('Please wait a moment before trying again.')
      return
    }
    
    setLastAttemptTime(now)
    setLoading(true)

    try {
      const supabase = createClient()
      
      // Log diagnostic info in development
      if (process.env.NODE_ENV === 'development') {
        console.log('🔍 Login attempt:', {
          email,
          supabaseUrl: process.env.NEXT_PUBLIC_BCON_SUPABASE_URL?.substring(0, 30) + '...',
          timestamp: new Date().toISOString(),
        })
      }
      
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      })

      if (error) {
        // Log full error details for debugging
        console.error('❌ Supabase Auth Error:', {
          message: error.message,
          status: (error as any).status,
          name: error.name,
          fullError: error,
        })

        // Check for rate limit errors (429 status)
        const isRateLimit = 
          error.message.includes('rate limit') || 
          error.message.includes('too many') ||
          error.message.includes('429') ||
          (error as any).status === 429

        if (isRateLimit) {
          // Set rate limit for 10 minutes (Supabase rate limits usually reset after 5-10 minutes)
          const limitUntil = now + 10 * 60 * 1000 // 10 minutes
          setRateLimited(true)
          setRateLimitUntil(limitUntil)
          localStorage.setItem('rateLimitUntil', limitUntil.toString())
          setError('Rate limited by Supabase. Please wait 10 minutes before trying again.')
          
          // Disable form for 10 minutes
          setTimeout(() => {
            setRateLimited(false)
            setRateLimitUntil(null)
            setAttemptCount(0)
            localStorage.removeItem('rateLimitUntil')
          }, 10 * 60 * 1000)
        } else if (error.message.includes('Invalid login credentials')) {
          setError('Invalid email or password. Please check your credentials and try again.')
          setAttemptCount(prev => {
            const newCount = prev + 1
            // After 3 failed attempts, suggest waiting
            if (newCount >= 3) {
              setError('Multiple failed attempts. Please wait a moment before trying again.')
              setLastAttemptTime(now + 10000) // Wait 10 seconds
            }
            return newCount
          })
        } else if (error.message.includes('Email not confirmed')) {
          setError('Please verify your email address before signing in.')
        } else {
          setError(error.message)
        }
        
        setLoading(false)
      } else {
        // Reset everything on success
        setAttemptCount(0)
        setLastAttemptTime(null)
        setRateLimited(false)
        setRateLimitUntil(null)
        
          // Verify session is available
          if (data?.user && data?.session) {
            console.log('✅ Login successful, user:', data.user.email)
            console.log('✅ Session token available:', !!data.session.access_token)
            
            // Wait a moment to ensure session is fully established
            // Then redirect with full page reload to trigger middleware
            await new Promise(resolve => setTimeout(resolve, 300))
            
            // Send session to API to set cookies on server
            try {
              const syncUrl = '/api/auth/sync-session'
              console.log('🔄 Attempting to sync session to:', syncUrl)
              
              const syncResponse = await fetch(syncUrl, {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                  access_token: data.session.access_token,
                  refresh_token: data.session.refresh_token,
                  expires_at: data.session.expires_at,
                  expires_in: data.session.expires_in,
                  token_type: data.session.token_type,
                  user: data.session.user,
                }),
                credentials: 'include',
              })
              
              if (!syncResponse.ok) {
                const errorText = await syncResponse.text()
                let errorData
                try {
                  errorData = JSON.parse(errorText)
                } catch {
                  errorData = { error: errorText || 'Unknown error' }
                }
                console.error('❌ Sync failed:', {
                  status: syncResponse.status,
                  statusText: syncResponse.statusText,
                  error: errorData,
                })
                throw new Error(`Sync failed: ${errorData.error || syncResponse.statusText}`)
              }
              
              const result = await syncResponse.json()
              console.log('✅ Sync response:', result)
              
              if (syncResponse.ok && result.success) {
                console.log('✅ Session synced to cookies, redirecting...')
                console.log('✅ Sync result:', result)
                
                // Verify session is still available on client
                const { data: { user: verifyUser } } = await supabase.auth.getUser()
                if (!verifyUser) {
                  console.error('❌ Session lost after sync, retrying...')
                  // Retry sync once
                  try {
                    const retryResponse = await fetch('/api/auth/sync-session', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        access_token: data.session.access_token,
                        refresh_token: data.session.refresh_token,
                        expires_at: data.session.expires_at,
                        expires_in: data.session.expires_in,
                        token_type: data.session.token_type,
                        user: data.session.user,
                      }),
                      credentials: 'include',
                    })
                    if (retryResponse.ok) {
                      console.log('✅ Retry sync successful')
                    }
                  } catch (retryError) {
                    console.error('❌ Retry sync failed:', retryError)
                  }
                }
                
                // Wait longer for cookies to be set and propagated
                await new Promise(resolve => setTimeout(resolve, 1000))
                
                // Verify session one more time before redirect
                const { data: { user: finalVerify } } = await supabase.auth.getUser()
                if (finalVerify) {
                  console.log('✅ Final verification passed, redirecting...')
                  // Use window.location for full page reload to ensure cookies are read
                  window.location.href = '/dashboard'
                } else {
                  console.error('❌ Session verification failed, showing error')
                  setError('Login successful but session not established. Please try again.')
                  setLoading(false)
                }
              } else {
                console.warn('⚠️ Sync returned non-ok status:', result)
                const errorMsg = result.error || 'Failed to sync session'
                setError(`Login successful but session sync failed: ${errorMsg}. Please try again.`)
                setLoading(false)
              }
            } catch (error: any) {
              console.error('❌ Sync error:', error)
              const errorMsg = error?.message || 'Failed to sync session to server'
              setError(`Login successful but session sync failed: ${errorMsg}. Please try again.`)
              setLoading(false)
              // Don't redirect if sync failed - user needs to see the error
            }
          } else if (data?.user) {
            // User exists but no session - redirect anyway
            console.warn('⚠️ User exists but session not immediately available, redirecting...')
            router.push('/dashboard')
            router.refresh()
          } else {
            console.error('❌ Login successful but user data not available')
            setError('Login successful but user data not available. Please try again.')
            setLoading(false)
          }
      }
    } catch (err) {
      console.error('Login error:', err)
      setError('An unexpected error occurred. Please try again later.')
      setLoading(false)
    }
  }

  return (
    <div className={`login-page min-h-screen flex items-center justify-center py-12 px-4 sm:px-6 lg:px-8 ${
      darkMode ? 'bg-[#1A1025]' : 'bg-[#f6f6f6]'
    }`}>
      {/* Dark Mode Toggle */}
      <button
        onClick={toggleDarkMode}
        className={`login-page-theme-toggle fixed top-4 right-4 p-2 rounded-full transition-colors ${
          darkMode
            ? 'bg-[#2A1F3A] text-white hover:bg-[#3A2F4A] border border-[#3A2F4A]'
            : 'bg-[#ececec] text-black hover:bg-[#d0d0d0]'
        }`}
        aria-label="Toggle dark mode"
      >
        {darkMode ? '☀️' : '🌙'}
      </button>

      <div className={`login-page-card max-w-md w-full rounded-2xl shadow-xl p-8 ${
        darkMode ? 'bg-[#1A1025] border border-[#3A2F4A]' : 'bg-[#ffffff] border-2 border-[#d0d0d0]'
      }`}>
        <div className="login-page-card-content space-y-8">
          {/* Logo and Title */}
          <div className="login-page-header text-center">
            <div className="login-page-logo-container mx-auto w-16 h-16 mb-4 flex items-center justify-center">
              <div
                className="login-page-logo w-full h-full flex items-center justify-center rounded-full font-bold text-2xl"
                style={{
                  backgroundColor: '#8B5CF6',
                  color: '#ffffff'
                }}
              >
                B
              </div>
            </div>
            <h2 className={`login-page-title text-3xl font-normal font-exo-2 ${
              darkMode ? 'text-white' : 'text-black'
            }`}>
              Sign in
            </h2>
            <p className={`login-page-subtitle mt-2 text-sm font-zen-dots ${
              darkMode ? 'text-[#8B5CF6]' : 'text-[#7C3AED]'
            }`}>
              BCON Club
            </p>
          </div>

            {/* Error Message */}
            {error && (
              <div className={`login-page-error-message rounded-lg p-4 border ${
                darkMode 
                  ? 'bg-[#1A0F0A] border-red-500/50' 
                  : 'bg-red-50 border-red-200'
              }`}>
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
                {error.includes('wait') || error.includes('Rate limited') && (
                  <div className={`login-page-error-tip mt-2 text-xs ${
                    darkMode ? 'text-gray-400' : 'text-gray-600'
                  }`}>
                    💡 <strong>Tip:</strong> Please wait a few minutes and try again.
                  </div>
                )}
              </div>
            )}

          {/* Login Form */}
          <form className="login-page-form space-y-5" onSubmit={handleLogin}>
            {/* Email Field */}
            <div className="login-page-form-field">
              <label htmlFor="email" className={`login-page-form-label block text-sm font-medium mb-2 ${
                darkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Email
              </label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                className={`login-page-form-input-email w-full px-4 py-3 rounded-lg border focus:outline-none focus:ring-2 transition-colors ${
                  darkMode
                    ? 'bg-[#1A1025] border-[#3A2F4A] text-white placeholder-gray-500 focus:ring-[#8B5CF6] focus:border-[#8B5CF6]'
                    : 'bg-[#ffffff] border-[#d0d0d0] text-black placeholder-gray-500 focus:ring-[#8B5CF6] focus:border-[#8B5CF6]'
                }`}
                placeholder="demo@test.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            {/* Password Field */}
            <div className="login-page-form-field">
              <label htmlFor="password" className={`login-page-form-label block text-sm font-medium mb-2 ${
                darkMode ? 'text-gray-300' : 'text-gray-700'
              }`}>
                Password
              </label>
              <div className="login-page-form-password-container relative">
                <input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  className={`login-page-form-input-password w-full px-4 py-3 pr-12 rounded-lg border focus:outline-none focus:ring-2 transition-colors ${
                    darkMode
                      ? 'bg-[#1A1025] border-[#3A2F4A] text-white placeholder-gray-500 focus:ring-[#8B5CF6] focus:border-[#8B5CF6]'
                      : 'bg-[#ffffff] border-[#d0d0d0] text-black placeholder-gray-500 focus:ring-[#8B5CF6] focus:border-[#8B5CF6]'
                  }`}
                  placeholder="Enter your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
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
              className={`login-page-form-submit-button w-full py-3 px-4 font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus:ring-2 ${
                darkMode
                  ? 'bg-[#8B5CF6] text-white hover:bg-[#7C3AED] focus:ring-[#8B5CF6]'
                  : 'bg-[#8B5CF6] text-white hover:bg-[#7C3AED] focus:ring-[#8B5CF6]'
              }`}
            >
              {rateLimited 
                ? 'Rate Limited - Please Wait' 
                : loading 
                  ? 'Signing in...' 
                  : 'Log in'}
            </button>
          </form>

          {/* Access Info */}
          <div className="login-page-footer text-center">
            <p className={`login-page-footer-text text-xs ${
              darkMode ? 'text-gray-500' : 'text-gray-500'
            }`}>
              Visit{' '}
              <a
                href="https://bconclub.com"
                target="_blank"
                rel="noopener noreferrer"
                className={`login-page-footer-link hover:underline ${
                  darkMode ? 'text-[#8B5CF6] hover:text-[#A78BFA]' : 'text-[#7C3AED] hover:text-[#8B5CF6]'
                }`}
              >
                bconclub.com
              </a>
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}

