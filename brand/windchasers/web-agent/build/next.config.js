/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  // Optimize build performance
  typescript: {
    // Skip type checking during build to speed up deployment
    // Type errors will still be caught in CI/local development
    ignoreBuildErrors: process.env.NODE_ENV === 'production' && process.env.SKIP_TYPE_CHECK !== 'false',
  },
  eslint: {
    // Skip ESLint during build to speed up deployment
    ignoreDuringBuilds: process.env.NODE_ENV === 'production',
  },
  async headers() {
    return [
      {
        // CORS headers for widget page (iframe embedding)
        // Note: Middleware will handle CSP and X-Frame-Options dynamically
        source: '/widget',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
      {
        // CORS headers for static assets (fonts, images, etc.)
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, OPTIONS',
          },
        ],
      },
      {
        // CORS headers for API routes
        source: '/api/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*',
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST, OPTIONS',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type, Authorization',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig
