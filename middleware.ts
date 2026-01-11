import { type NextRequest, NextResponse } from 'next/server'
// AUTHENTICATION DISABLED
// import { updateSession } from '@/lib/supabase/middleware'

export async function middleware(request: NextRequest) {
  // AUTHENTICATION DISABLED - Middleware auth checks commented out
  // All routes are now public access
  
  // Skip auth check for API routes to prevent loops
  // if (request.nextUrl.pathname.startsWith('/api/')) {
  //   return await updateSession(request)
  // }
  
  // Skip auth check for static assets
  // if (request.nextUrl.pathname.startsWith('/_next/') || 
  //     request.nextUrl.pathname.startsWith('/favicon.ico')) {
  //   return await updateSession(request)
  // }
  
  // Skip auth check for auth pages to prevent redirect loops
  // if (request.nextUrl.pathname.startsWith('/auth/')) {
  //   return await updateSession(request)
  // }
  
  // return await updateSession(request)
  
  // Create response
  const response = NextResponse.next()
  
  // Add CORS headers for goproxe.com
  response.headers.set('Access-Control-Allow-Origin', 'https://goproxe.com')
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST')
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type')
  
  // Handle preflight requests
  if (request.method === 'OPTIONS') {
    return new NextResponse(null, {
      status: 200,
      headers: {
        'Access-Control-Allow-Origin': 'https://goproxe.com',
        'Access-Control-Allow-Methods': 'GET, POST',
        'Access-Control-Allow-Headers': 'Content-Type',
      },
    })
  }
  
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public folder
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}


