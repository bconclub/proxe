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
  
  // Production build optimizations
  swcMinify: true, // Use SWC minifier (faster than Terser)
  compress: true, // Enable gzip compression
  
  // Optimize images
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
  },
  
  // Reduce build output size
  experimental: {
    // Enable output file tracing for standalone builds
    outputFileTracingIncludes: {
      '/api/**/*': ['./node_modules/**/*.wasm'],
    },
    // Optimize package imports
    optimizePackageImports: ['@supabase/supabase-js', 'recharts', 'lottie-react'],
    // Exclude client-only packages from server bundles
    serverComponentsExternalPackages: ['ogl', 'lottie-react'],
  },
  
  // Webpack optimizations
  webpack: (config, { dev, isServer }) => {
    // Fix for client-side code in server bundles
    if (isServer) {
      // Provide fallbacks for browser globals that don't exist in Node.js
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
        crypto: false,
      }
      
      // Define browser globals for server builds to prevent "self is not defined" errors
      const webpack = require('webpack')
      // Ensure plugins array exists
      if (!config.plugins) {
        config.plugins = []
      }
      // Replace 'self' with 'globalThis' in server builds
      config.plugins.push(
        new webpack.DefinePlugin({
          'self': 'globalThis',
        })
      )
    }
    
    // Production-only optimizations (client-side only)
    if (!dev && !isServer) {
      // Reduce bundle size
      config.optimization = {
        ...config.optimization,
        moduleIds: 'deterministic',
        runtimeChunk: 'single',
        splitChunks: {
          chunks: 'all',
          cacheGroups: {
            default: false,
            vendors: false,
            // Vendor chunk for node_modules (client-side only)
            vendor: {
              name: 'vendor',
              chunks: 'all',
              test: /node_modules/,
              priority: 20,
            },
            // Common chunk for shared code
            common: {
              name: 'common',
              minChunks: 2,
              chunks: 'all',
              priority: 10,
              reuseExistingChunk: true,
            },
          },
        },
      }
    }
    
    return config
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
