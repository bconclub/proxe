import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { NextRequest } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = await createClient()
    await supabase.auth.exchangeCodeForSession(code)
  }

  // Honor a `next` destination (e.g. password-recovery links point at
  // /auth/reset-password). Restrict to same-origin absolute PATHS only - never
  // an attacker-supplied absolute URL - so this can't become an open redirect.
  const nextParam = requestUrl.searchParams.get('next')
  const safeNext =
    nextParam && nextParam.startsWith('/') && !nextParam.startsWith('//')
      ? nextParam
      : '/dashboard'

  return NextResponse.redirect(new URL(safeNext, requestUrl.origin))
}
