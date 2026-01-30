/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    trustProxy: true,
  },
  eslint: {
    // Don't fail build on ESLint errors during production builds
    ignoreDuringBuilds: true,
  },
  typescript: {
    // Don't fail build on TypeScript errors (we already have type-check script)
    ignoreBuildErrors: false,
  },
  webpack: (config, { isServer }) => {
    // Fix for Next.js vendor chunk issue with @ symbols in filenames
    // Disable server-side vendor chunk splitting to avoid Node.js require() issues with @ symbols
    if (isServer) {
      config.optimization = {
        ...config.optimization,
        splitChunks: false, // Disable chunk splitting for server-side to avoid @ symbol issues
      }
      // Externalize large dependencies to reduce serverless function size
      config.externals = [
        '@supabase/supabase-js',
        '@supabase/ssr',
        ...(config.externals || [])
      ]
    }
    // Ensure @ alias resolves correctly (avoids module-not-found in Vercel builds)
    config.resolve.alias = {
      ...config.resolve.alias,
      '@': require('path').resolve(__dirname, 'src'),
    }
    return config
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          {
            key: 'Access-Control-Allow-Origin',
            value: '*', // Update with {{BRAND_NAME}} domain when available
          },
          {
            key: 'Access-Control-Allow-Methods',
            value: 'GET, POST',
          },
          {
            key: 'Access-Control-Allow-Headers',
            value: 'Content-Type',
          },
        ],
      },
      {
        // Cache static chunks with versioning to prevent stale chunks
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
      {
        // Ensure CSS files are served correctly
        source: '/_next/static/css/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
          {
            key: 'Content-Type',
            value: 'text/css; charset=utf-8',
          },
        ],
      },
      {
        // Ensure font files are served correctly
        source: '/_next/static/media/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ]
  },
}

module.exports = nextConfig

