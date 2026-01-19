/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  experimental: {
    trustProxy: true,
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
    ]
  },
}

module.exports = nextConfig

