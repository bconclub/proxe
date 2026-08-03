import { NextResponse } from 'next/server'

/**
 * Deployment self-report: which env vars actually reached this build/runtime.
 *
 * Diagnosing "the variable IS set in the dashboard but the feature says it
 * isn't" is otherwise guesswork from the outside — Vercel's env is not
 * readable via the API, and flags like "Sensitive" silently withhold a value
 * from the BUILD while still granting it at runtime. That distinction is
 * invisible until something breaks, so this route makes it explicit.
 *
 * Reports presence and length only — never a value, never a prefix. Safe to
 * leave deployed; it leaks nothing an attacker can use.
 *
 * `inlinedAtBuild` matters: Next replaces every literal
 * `process.env.NEXT_PUBLIC_*` at build time, in server code too. A var that is
 * only present at runtime therefore reads as undefined in code that was
 * compiled against it.
 */
export const dynamic = 'force-dynamic'

// Literal references so Next inlines the build-time value where it would.
const BUILD_INLINED: Record<string, string | undefined> = {
  NEXT_PUBLIC_META_APP_ID: process.env.NEXT_PUBLIC_META_APP_ID,
  NEXT_PUBLIC_META_ES_CONFIG_ID: process.env.NEXT_PUBLIC_META_ES_CONFIG_ID,
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_BRAND: process.env.NEXT_PUBLIC_BRAND,
}

// Read dynamically so we see the RUNTIME value, bypassing build inlining.
const RUNTIME_KEYS = [
  'NEXT_PUBLIC_META_APP_ID',
  'NEXT_PUBLIC_META_ES_CONFIG_ID',
  'META_APP_SECRET',
  'META_WHATSAPP_VERIFY_TOKEN',
  'CLAUDE_API_KEY',
  'CLAUDE_MODEL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'INBOUND_API_KEY',
  'ALLOWED_WIDGET_ORIGINS',
  'BRAND_ID',
]

function describe(v: string | undefined) {
  if (v === undefined) return { present: false, len: 0 }
  return { present: v.length > 0, len: v.length }
}

export async function GET() {
  const env = process.env as Record<string, string | undefined>

  const runtime: Record<string, { present: boolean; len: number }> = {}
  for (const k of RUNTIME_KEYS) runtime[k] = describe(env[k])

  const build: Record<string, { present: boolean; len: number }> = {}
  for (const [k, v] of Object.entries(BUILD_INLINED)) build[k] = describe(v)

  // The exact expression the WhatsApp card gates on.
  const embeddedSignupReady =
    !!process.env.NEXT_PUBLIC_META_APP_ID &&
    !!process.env.META_APP_SECRET &&
    !!process.env.NEXT_PUBLIC_META_ES_CONFIG_ID

  return NextResponse.json({
    brand: process.env.BRAND_ID ?? process.env.NEXT_PUBLIC_BRAND ?? null,
    vercelEnv: process.env.VERCEL_ENV ?? null,
    embeddedSignupReady,
    runtime,
    inlinedAtBuild: build,
    hint:
      'present:false under inlinedAtBuild but true under runtime => the var was ' +
      'withheld from the build (e.g. marked Sensitive in Vercel).',
  })
}
