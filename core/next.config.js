/** @type {import('next').NextConfig} */
const path = require('path')

// The active brand is chosen at build time by BRAND_ID. `@brand` resolves to that
// brand's pack (/brands/<id>) — config, prompts, templates. This is what lets ONE
// core build every brand: no per-brand code, just a different pack aliased in.
const BRAND_ID = process.env.BRAND_ID || process.env.NEXT_PUBLIC_BRAND || 'windchasers'
const BRAND_DIR = path.resolve(__dirname, '..', 'brands', BRAND_ID)

const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_BRAND: BRAND_ID,
    NEXT_PUBLIC_BRAND_ID: BRAND_ID,
  },
  typescript: {
    ignoreBuildErrors: process.env.VERCEL === '1' || process.env.NODE_ENV === 'production',
  },
  // allow importing the brand pack from outside the core app root (/brands/<id>)
  experimental: { externalDir: true },
  webpack: (config) => {
    config.resolve.alias['@brand'] = BRAND_DIR
    config.resolve.alias['@'] = path.resolve(__dirname, 'src')
    return config
  },
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
        ],
      },
      {
        source: '/_next/static/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/_next/static/css/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
          { key: 'Content-Type', value: 'text/css; charset=utf-8' },
        ],
      },
      {
        source: '/_next/static/media/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ]
  },
}

module.exports = nextConfig
