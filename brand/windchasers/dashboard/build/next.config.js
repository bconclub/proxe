/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    trustProxy: true,
  },
  eslint: {
    // Don't fail build on ESLint errors during production builds
    ignoreDuringBuilds: false,
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
            value: '*', // Update with Windchasers domain when available
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
    ]
  },
}

module.exports = nextConfig

