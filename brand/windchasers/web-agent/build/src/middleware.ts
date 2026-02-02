import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  const response = NextResponse.next()
  const origin = request.headers.get('origin') || request.headers.get('referer')
  const isLocalhost = origin?.includes('localhost') || origin?.includes('127.0.0.1')
  const isDev = process.env.NODE_ENV !== 'production'
  const pathname = request.nextUrl.pathname
  
  // Add CORS headers for widget page, API routes, and static assets
  const isWidget = pathname === '/widget'
  const isApi = pathname.startsWith('/api/')
  const isStatic = pathname.startsWith('/_next/static/')
  
  if (isWidget || isApi || isStatic) {
    // In development, allow the requesting origin (for localhost)
    // In production, allow all origins
    if (isDev && origin) {
      response.headers.set('Access-Control-Allow-Origin', origin)
    } else {
      response.headers.set('Access-Control-Allow-Origin', '*')
    }
    
    if (isApi) {
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      response.headers.set('Access-Control-Allow-Credentials', 'true')
    } else {
      response.headers.set('Access-Control-Allow-Methods', 'GET, OPTIONS')
    }
    
    // Handle OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new NextResponse(null, { status: 204, headers: response.headers })
    }
  }
  
  // For widget page, set CSP dynamically based on environment
  if (isWidget) {
    if (isDev) {
      // Remove CSP restriction in development to allow any localhost origin
      // This is safe because it's only in development
      response.headers.delete('Content-Security-Policy')
      // Also remove X-Frame-Options to allow iframe embedding from any localhost
      response.headers.delete('X-Frame-Options')
    } else {
      // Production: Set restrictive CSP
      response.headers.set(
        'Content-Security-Policy',
        "frame-ancestors 'self' https://proxe.windchasers.in https://windchasers.in https://pilot.windchasers.in http://localhost:* http://localhost:3000 http://localhost:3001"
      )
      response.headers.set('X-Frame-Options', 'SAMEORIGIN')
    }
  }
  
  return response
}

export const config = {
  matcher: [
    '/widget',
    '/api/:path*',
    '/_next/static/:path*',
  ],
}
