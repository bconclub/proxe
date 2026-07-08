/** @type {import('next').NextConfig} */
const path = require('path')

// The active brand is chosen at build time by BRAND_ID. `@brand` resolves to that
// brand's pack (/brands/<id>) — config, prompts, templates. This is what lets ONE
// core build every brand: no per-brand code, just a different pack aliased in.
// `.brand` is a junction/symlink to /brands/<id>, created by stage-brand.js
// (predev/prebuild). Resolving through it — instead of naming a brand dir here —
// keeps every resolver (webpack alias below AND tsconfig `paths`) pointed at one
// stage-time source of truth. tsconfig paths BEAT webpack aliases in Next's
// resolver, so both must agree or the tsconfig one silently wins.
const fs = require('fs')
const BRAND_LINK = path.resolve(__dirname, '.brand')
const BRAND_DIR = fs.existsSync(BRAND_LINK) ? fs.realpathSync(BRAND_LINK) : null
if (!BRAND_DIR) {
  throw new Error('[next.config] core/.brand missing — run via npm scripts so stage-brand.js stages a brand (BRAND_ID=<id>).')
}
const BRAND_ID = path.basename(BRAND_DIR)
const ENV_BRAND = process.env.BRAND_ID || process.env.NEXT_PUBLIC_BRAND
if (ENV_BRAND && ENV_BRAND !== BRAND_ID) {
  throw new Error(`[next.config] staged brand "${BRAND_ID}" != BRAND_ID env "${ENV_BRAND}" — re-run so stage-brand restages.`)
}
console.log(`[next.config] building "${BRAND_ID}" from ${BRAND_DIR}`)

const nextConfig = {
  reactStrictMode: true,
  // Parallel dev servers from this same folder corrupt each other's .next
  // chunks (ChunkLoadError). Opt into an isolated build dir per server with
  // NEXT_DIST_DIR; default stays .next so Vercel/prod is untouched.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  env: {
    NEXT_PUBLIC_BRAND: BRAND_ID,
    NEXT_PUBLIC_BRAND_ID: BRAND_ID,
    // Supabase name bridge. One-core reads the GENERIC names
    // (NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY), but the existing per-brand Vercel
    // projects still store them fork-era brand-prefixed
    // (NEXT_PUBLIC_<BRAND>_SUPABASE_*). Resolve the ACTIVE brand's own value here
    // — generic first, else this brand's prefixed — and inline it under the
    // generic name. Each brand's build reads ITS OWN database (bcon->bcon,
    // pop->pop); nothing is shared and no secret needs renaming/re-entering.
    // Dynamic process.env access is fine HERE (build-time Node), unlike client code.
    NEXT_PUBLIC_SUPABASE_URL:
      process.env.NEXT_PUBLIC_SUPABASE_URL ||
      process.env[`NEXT_PUBLIC_${BRAND_ID.toUpperCase()}_SUPABASE_URL`] ||
      '',
    NEXT_PUBLIC_SUPABASE_ANON_KEY:
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env[`NEXT_PUBLIC_${BRAND_ID.toUpperCase()}_SUPABASE_ANON_KEY`] ||
      '',
  },
  typescript: {
    ignoreBuildErrors: process.env.VERCEL === '1' || process.env.NODE_ENV === 'production',
  },
  // Fork-ported brand files are carried verbatim (live parity) and trip style
  // rules like react/no-unescaped-entities; lint gating happens in dev/CI, not
  // the production build (same policy as TS above).
  eslint: { ignoreDuringBuilds: true },
  // allow importing the brand pack from outside the core app root (/brands/<id>)
  experimental: { externalDir: true },
  webpack: (config) => {
    config.resolve.alias['@brand'] = BRAND_LINK
    config.resolve.alias['@'] = path.resolve(__dirname, 'src')
    // Brand-pack files (/brands/<id>/widget, outside core) resolve bare imports
    // via the repo-root node_modules junction -> core/node_modules (created by
    // stage-brand.js), reached by normal upward walking. Do NOT add
    // core/node_modules to resolve.modules and do NOT alias bare react here:
    // both create second module identities in junctioned setups (two react
    // copies -> hydration death) or break Next's per-layer react remap
    // (React.cache in server components).
    return config
  },
  async headers() {
    const cors = {
      source: '/:path*',
      headers: [
        { key: 'Access-Control-Allow-Origin', value: '*' },
        { key: 'Access-Control-Allow-Methods', value: 'GET, POST' },
        { key: 'Access-Control-Allow-Headers', value: 'Content-Type' },
      ],
    }
    // Immutable caching is production-only: dev chunk URLs don't change between
    // restarts, so an immutable header makes the browser serve the PREVIOUS
    // brand's compiled JS after a BRAND_ID switch.
    if (process.env.NODE_ENV !== 'production') return [cors]
    return [
      cors,
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
