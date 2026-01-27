/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  reactStrictMode: true,
  webpack: (config, { isServer, webpack }) => {
    // Fix for webpack module resolution issues
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      }
    }
    
    // Ensure webpack plugins are properly initialized
    config.plugins = config.plugins || []
    
    // Fix for dynamic import issues with React Server Components
    config.optimization = {
      ...config.optimization,
      moduleIds: 'deterministic',
    }
    
    // Ensure proper module resolution for dynamic imports
    config.resolve.alias = {
      ...config.resolve.alias,
    }
    
    return config
  },
  // Disable cache during development to avoid webpack issues
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  // Experimental features to improve stability
  experimental: {
    optimizePackageImports: ['@supabase/supabase-js'],
  },
}

module.exports = nextConfig
