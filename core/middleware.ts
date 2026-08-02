import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

/**
 * Cross-origin allowlist for /api/* — set per deployment, never hardcoded
 * (a brand's landing domain is brand data; core stays brand-agnostic).
 * ALLOWED_WIDGET_ORIGINS: comma-separated origins, e.g.
 *   https://example.com,https://www.example.com
 * Unset ⇒ no CORS header ⇒ same-origin only (the old code pinned one brand's
 * domain here, which broke every other brand's cross-origin widget anyway).
 */
const ALLOWED_ORIGINS = (process.env.ALLOWED_WIDGET_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)

export async function middleware(request: NextRequest) {
  // Skip auth check for API routes to prevent loops
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const response = await updateSession(request)
    // CORS: echo the request Origin only when allowlisted
    const origin = request.headers.get('origin')
    if (origin && ALLOWED_ORIGINS.includes(origin)) {
      response.headers.set('Access-Control-Allow-Origin', origin)
      response.headers.set('Vary', 'Origin')
    }
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST')
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
    return response
  }
  
  // Skip auth check for static assets
  if (request.nextUrl.pathname.startsWith('/_next/') || 
      request.nextUrl.pathname.startsWith('/favicon.ico')) {
    return await updateSession(request)
  }
  
  // Skip auth check for auth pages to prevent redirect loops
  if (request.nextUrl.pathname.startsWith('/auth/')) {
    return await updateSession(request)
  }
  
  // Skip auth check for widget preview page (public preview) - return immediately without session update
  if (request.nextUrl.pathname === '/widget' || request.nextUrl.pathname.startsWith('/widget/')) {
    return NextResponse.next()
  }
  
  // Update session for all other routes (including dashboard)
  return await updateSession(request)
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - widget (public widget preview page)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|widget|widget/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}


