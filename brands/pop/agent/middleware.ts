import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // Skip auth check for API routes to prevent loops
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const response = await updateSession(request)
    // Add CORS headers for API routes
    response.headers.set('Access-Control-Allow-Origin', 'https://bconclub.com')
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
    '/((?!_next/static|_next/image|favicon.ico|widget|widget/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
