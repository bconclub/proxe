/**
 * POST /api/dashboard/report-issue
 *
 * Stores a teammate's issue report (screenshots + description + auto-context)
 * in the brand's OWN Supabase storage — private bucket `issue-reports`, one
 * folder per report:
 *
 *   issue-reports/<yyyy-mm>/<ISS-id>/report.json
 *   issue-reports/<yyyy-mm>/<ISS-id>/screenshot-1.png …
 *
 * Deliberately bucket-only (no table): the bucket is created on demand via the
 * storage API with the service key, so every brand gets this with ZERO SQL
 * migrations. HQ aggregates all brands' buckets into the issues vault with
 * scripts/issues-sync/pull-issues.mjs.
 */

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getServiceClient } from '@/lib/services'
import { getBrandConfig } from '@/configs'

export const dynamic = 'force-dynamic'

const BUCKET = 'issue-reports'
const MAX_SHOTS = 4
const MAX_SHOT_BYTES = 8 * 1024 * 1024

const EXT_BY_MIME: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
}

export async function POST(request: NextRequest) {
  try {
    // Dashboard-auth only — this is an internal team surface, not public.
    const authClient = await createClient()
    const {
      data: { user },
    } = await authClient.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const supabase = getServiceClient()
    if (!supabase) {
      return NextResponse.json({ error: 'Service client unavailable' }, { status: 500 })
    }

    const form = await request.formData()
    const description = String(form.get('description') || '').trim()
    const severity = String(form.get('severity') || 'broken')
    let context: Record<string, unknown> = {}
    try {
      context = JSON.parse(String(form.get('context') || '{}'))
    } catch {
      /* context stays {} — never block a report over bad metadata */
    }
    const screenshots = form
      .getAll('screenshots')
      .filter((f): f is File => f instanceof File && f.size > 0)
      .slice(0, MAX_SHOTS)

    if (!description && screenshots.length === 0) {
      return NextResponse.json(
        { error: 'A description or screenshot is required' },
        { status: 400 },
      )
    }
    for (const shot of screenshots) {
      if (shot.size > MAX_SHOT_BYTES) {
        return NextResponse.json({ error: 'Screenshot too large (max 8MB)' }, { status: 400 })
      }
      if (!shot.type.startsWith('image/')) {
        return NextResponse.json({ error: 'Screenshots must be images' }, { status: 400 })
      }
    }

    const { brand } = getBrandConfig()
    const now = new Date()
    const ymd = now.toISOString().slice(0, 10).replace(/-/g, '')
    const id = `ISS-${ymd}-${Math.random().toString(36).slice(2, 8)}`
    const folder = `${now.toISOString().slice(0, 7)}/${id}`

    // Upload with one bucket-not-found retry: first report on a fresh brand
    // creates the private bucket via the storage API (service key — no DDL).
    // cacheControl '0': report.json gets REWRITTEN by the vault sync (--push
    // status/fix updates) — the default 1h CDN cache serves stale reports back
    // to the next sync run. Reports are low-traffic; skip caching entirely.
    const upload = async (path: string, body: Blob | string, contentType: string) => {
      const payload = typeof body === 'string' ? new Blob([body], { type: contentType }) : body
      const opts = { contentType, upsert: true, cacheControl: '0' }
      let { error } = await supabase.storage.from(BUCKET).upload(path, payload, opts)
      if (error && /bucket.*not.*found/i.test(error.message)) {
        await supabase.storage.createBucket(BUCKET, { public: false }).catch(() => {})
        ;({ error } = await supabase.storage.from(BUCKET).upload(path, payload, opts))
      }
      if (error) throw new Error(`Storage upload failed (${path}): ${error.message}`)
    }

    const shotNames: string[] = []
    for (let i = 0; i < screenshots.length; i++) {
      const shot = screenshots[i]
      const ext = EXT_BY_MIME[shot.type] || 'png'
      const name = `screenshot-${i + 1}.${ext}`
      await upload(`${folder}/${name}`, shot, shot.type)
      shotNames.push(name)
    }

    const report = {
      id,
      brand,
      created_at: now.toISOString(),
      reporter: user.email || user.id,
      severity,
      description,
      context,
      screenshots: shotNames,
      // Lifecycle fields — the vault (Obsidian) is the working surface; the
      // sync script writes status/fix changes back here so this stays truth.
      status: 'new',
      fix: null as string | null,
      fixed_at: null as string | null,
    }
    await upload(`${folder}/report.json`, JSON.stringify(report, null, 2), 'application/json')

    return NextResponse.json({ success: true, id })
  } catch (error) {
    console.error('[report-issue] failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 },
    )
  }
}
