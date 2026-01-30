/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  eslint: {
    // Root `.eslintrc.json` lives at repo root and may not have deps installed.
    // Skip ESLint during `next build` to avoid Vercel build failures.
    ignoreDuringBuilds: true,
  },
  webpack: (config, { isServer }) => {
    if (isServer) {
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
            value: 'https://goproxe.com',
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

