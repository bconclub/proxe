#!/usr/bin/env node
/**
 * Issues vault sync — pulls every brand's `issue-reports` Supabase bucket
 * (written by /api/dashboard/report-issue) into one Obsidian vault, and
 * pushes vault-side status/fix updates back to the buckets.
 *
 * Zero dependencies — raw fetch against the Supabase Storage REST API using
 * each brand's own service key from brands/<id>/.env.local (keys never leave
 * this machine; nothing cross-brand is copied anywhere).
 *
 * Usage (from repo root):
 *   node scripts/issues-sync/pull-issues.mjs                 # pull new reports into the vault
 *   node scripts/issues-sync/pull-issues.mjs --push          # also push vault status/fix edits back
 *   node scripts/issues-sync/pull-issues.mjs --vault D:\Vault --brand windchasers
 *
 * Vault layout (open the folder as an Obsidian vault):
 *   <vault>/Index.md                       auto-generated dashboard (every run)
 *   <vault>/Issues/<brand>/<id> <slug>.md  one note per report (created once, then YOURS —
 *                                          edit status/Fix freely; --push writes them back)
 *   <vault>/Issues/_attachments/<id>/…     screenshots
 *
 * Workflow: teammate reports → run this → triage in Obsidian → set
 * `status: fixed` + fill "## Fix" as you ship → run with --push. The Fix
 * sections become the learning log; Index.md shows open items per brand.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(__dirname, '..', '..')
const BUCKET = 'issue-reports'

// ---------------------------------------------------------------- args
const args = process.argv.slice(2)
const flag = (name) => args.includes(`--${name}`)
const opt = (name) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : null
}
const VAULT = path.resolve(opt('vault') || process.env.ISSUES_VAULT || 'C:/PROXe-Issues')
const ONLY_BRAND = opt('brand')
const DO_PUSH = flag('push')

// ---------------------------------------------------------------- env
function parseEnvFile(file) {
  const out = {}
  if (!fs.existsSync(file)) return out
  for (const raw of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq < 1) continue
    const key = line.slice(0, eq).trim()
    let val = line.slice(eq + 1).trim()
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1)
    }
    out[key] = val
  }
  return out
}

function discoverBrands() {
  const brandsDir = path.join(REPO_ROOT, 'brands')
  const brands = []
  for (const id of fs.readdirSync(brandsDir)) {
    if (ONLY_BRAND && id !== ONLY_BRAND) continue
    const env = parseEnvFile(path.join(brandsDir, id, '.env.local'))
    const bp = id.toUpperCase()
    const url =
      env[`NEXT_PUBLIC_${bp}_SUPABASE_URL`] || env.NEXT_PUBLIC_SUPABASE_URL ||
      env[`${bp}_SUPABASE_URL`] || env.SUPABASE_URL
    const key =
      env[`${bp}_SUPABASE_SERVICE_KEY`] || env.SUPABASE_SERVICE_ROLE_KEY ||
      env[`${bp}_SUPABASE_SERVICE_ROLE_KEY`] || env.SUPABASE_SERVICE_KEY
    if (url && key) brands.push({ id, url: url.replace(/\/$/, ''), key })
    else if (fs.existsSync(path.join(brandsDir, id, '.env.local'))) {
      console.warn(`  ! ${id}: .env.local has no Supabase URL + service key — skipped`)
    }
  }
  return brands
}

// ---------------------------------------------------------------- storage REST
async function storage(brand, method, p, body, headers = {}) {
  const res = await fetch(`${brand.url}/storage/v1/${p}`, {
    method,
    headers: {
      Authorization: `Bearer ${brand.key}`,
      apikey: brand.key,
      ...headers,
    },
    body,
  })
  return res
}

async function listFolder(brand, prefix) {
  const res = await storage(brand, 'POST', `object/list/${BUCKET}`, JSON.stringify({
    prefix, limit: 1000, offset: 0, sortBy: { column: 'name', order: 'asc' },
  }), { 'Content-Type': 'application/json' })
  if (!res.ok) return null // bucket missing → no reports yet
  return res.json()
}

async function download(brand, objPath) {
  // Cache-buster: report.json is mutated by --push; older uploads may carry a
  // long CDN max-age, and a stale read here would silently clobber a newer
  // status on the next push. Unique query = guaranteed CDN miss.
  const res = await storage(brand, 'GET', `object/${BUCKET}/${encodeURIComponent(objPath).replace(/%2F/g, '/')}?v=${Date.now()}`)
  if (!res.ok) return null
  return Buffer.from(await res.arrayBuffer())
}

async function uploadJson(brand, objPath, obj) {
  const res = await storage(brand, 'PUT', `object/${BUCKET}/${objPath}`, JSON.stringify(obj, null, 2), {
    'Content-Type': 'application/json',
    'x-upsert': 'true',
  })
  if (!res.ok) {
    // Some storage versions want POST+upsert for create-or-replace.
    const res2 = await storage(brand, 'POST', `object/${BUCKET}/${objPath}`, JSON.stringify(obj, null, 2), {
      'Content-Type': 'application/json',
      'x-upsert': 'true',
    })
    if (!res2.ok) throw new Error(`push failed for ${objPath}: ${res.status}/${res2.status}`)
  }
}

// ---------------------------------------------------------------- vault
const sanitize = (s) => s.replace(/[\\/:*?"<>|#^[\]\r\n]/g, ' ').replace(/\s+/g, ' ').trim()

function noteBody(report, shotRefs) {
  const c = report.context || {}
  const errors = Array.isArray(c.recent_errors) && c.recent_errors.length
    ? c.recent_errors.map((e) => `- \`${String(e).replace(/`/g, "'")}\``).join('\n')
    : '- (none captured)'
  return `---
id: ${report.id}
brand: ${report.brand}
status: ${report.status || 'new'}
severity: ${report.severity || 'broken'}
reported: ${report.created_at}
reporter: ${report.reporter || 'unknown'}
page: "${c.page || ''}"
version: "${c.version || ''}"
tags: [issue, ${report.brand}]
---

## Report

${report.description || '_(screenshot only)_'}

${shotRefs.map((r) => `![[${r}]]`).join('\n')}

## Context

- **Page:** ${c.page || '?'} (${c.url || '?'})
- **App version:** ${c.version || '?'}
- **Viewport:** ${c.viewport || '?'} · screen ${c.screen || '?'}
- **Browser:** ${c.user_agent || '?'}
- **Recent console errors:**
${errors}

## Fix

<!-- Fill as you work. Set frontmatter status: new | in-progress | fixed | wont-fix,
     then run pull-issues.mjs --push to sync back to the brand.
     What was the root cause? What shipped (commit)? What did we learn? -->
`
}

function parseFrontmatter(md) {
  const m = md.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return {}
  const out = {}
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^(\w[\w-]*):\s*(.*)$/)
    if (kv) out[kv[1]] = kv[2].replace(/^"|"$/g, '').trim()
  }
  return out
}

function fixSection(md) {
  const m = md.match(/## Fix\r?\n([\s\S]*)$/)
  if (!m) return ''
  return m[1].replace(/<!--[\s\S]*?-->/g, '').trim()
}

// ---------------------------------------------------------------- main
async function pullBrand(brand) {
  const months = await listFolder(brand, '')
  if (!months) { console.log(`  ${brand.id}: no issue-reports bucket yet`) ; return [] }
  const reports = []
  for (const month of months) {
    if (month.id !== null) continue // only folders
    const ids = await listFolder(brand, month.name)
    for (const entry of ids || []) {
      if (entry.id !== null) continue
      const folder = `${month.name}/${entry.name}`
      const raw = await download(brand, `${folder}/report.json`)
      if (!raw) continue
      try {
        reports.push({ folder, report: JSON.parse(raw.toString('utf8')) })
      } catch { console.warn(`  ! ${brand.id}: bad report.json in ${folder}`) }
    }
  }
  return reports
}

async function main() {
  console.log(`Issues vault: ${VAULT}${DO_PUSH ? ' (push mode)' : ''}`)
  fs.mkdirSync(path.join(VAULT, 'Issues', '_attachments'), { recursive: true })

  const brands = discoverBrands()
  if (!brands.length) { console.error('No brands with Supabase creds found under brands/*/.env.local'); process.exit(1) }

  // Existing vault notes by id — a note, once created, belongs to the human.
  const existing = new Map() // id → { file, md }
  const issuesDir = path.join(VAULT, 'Issues')
  const walk = (dir) => {
    for (const f of fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }) : []) {
      const full = path.join(dir, f.name)
      if (f.isDirectory() && f.name !== '_attachments') walk(full)
      else if (f.isFile() && f.name.endsWith('.md')) {
        const md = fs.readFileSync(full, 'utf8')
        const fm = parseFrontmatter(md)
        if (fm.id) existing.set(fm.id, { file: full, md, fm })
      }
    }
  }
  walk(issuesDir)

  let created = 0, pushed = 0
  const all = [] // { brand, report, folder }

  for (const brand of brands) {
    console.log(`- ${brand.id}…`)
    const reports = await pullBrand(brand)
    for (const { folder, report } of reports) {
      all.push({ brand: brand.id, report })
      const known = existing.get(report.id)

      if (!known) {
        // New report → download screenshots + create the note.
        const attDir = path.join(VAULT, 'Issues', '_attachments', report.id)
        const shotRefs = []
        for (const shot of report.screenshots || []) {
          const buf = await download(brand, `${folder}/${shot}`)
          if (buf) {
            fs.mkdirSync(attDir, { recursive: true })
            fs.writeFileSync(path.join(attDir, shot), buf)
            shotRefs.push(`Issues/_attachments/${report.id}/${shot}`)
          }
        }
        const slug = sanitize(report.description || '').slice(0, 40) || 'screenshot report'
        const dir = path.join(VAULT, 'Issues', brand.id)
        fs.mkdirSync(dir, { recursive: true })
        const file = path.join(dir, `${report.id} ${slug}.md`)
        fs.writeFileSync(file, noteBody(report, shotRefs))
        existing.set(report.id, { file, md: '', fm: { id: report.id, status: report.status } })
        created++
        console.log(`    + ${report.id} (${report.severity}) ${slug}`)
      } else if (DO_PUSH) {
        // Vault is the working surface — push status/fix edits back to the brand.
        const fm = parseFrontmatter(fs.readFileSync(known.file, 'utf8'))
        const fix = fixSection(fs.readFileSync(known.file, 'utf8'))
        const statusChanged = fm.status && fm.status !== report.status
        const fixChanged = fix && fix !== (report.fix || '')
        if (statusChanged || fixChanged) {
          const updated = {
            ...report,
            status: fm.status || report.status,
            fix: fix || report.fix,
            fixed_at: fm.status === 'fixed' && !report.fixed_at ? new Date().toISOString() : report.fixed_at,
          }
          await uploadJson(brand, `${folder}/report.json`, updated)
          pushed++
          console.log(`    ^ ${report.id} → status=${updated.status}${fixChanged ? ' +fix' : ''}`)
        }
      }
    }
  }

  // ------------------------------------------------------------- Index.md
  // Regenerated every run from the VAULT notes (vault = truth for status).
  const rows = []
  for (const [id, { file }] of existing) {
    const md = fs.readFileSync(file, 'utf8')
    const fm = parseFrontmatter(md)
    rows.push({
      id, brand: fm.brand || '?', status: fm.status || 'new', severity: fm.severity || '',
      reported: fm.reported || '', page: fm.page || '',
      link: path.relative(VAULT, file).replace(/\\/g, '/').replace(/\.md$/, ''),
    })
  }
  rows.sort((a, b) => (b.reported || '').localeCompare(a.reported || ''))
  const open = rows.filter((r) => r.status === 'new' || r.status === 'in-progress')
  const fixed = rows.filter((r) => r.status === 'fixed')
  const line = (r) => `- ${r.status === 'in-progress' ? '🔧' : r.severity === 'blocking' ? '🔴' : '🟡'} [[${r.link}|${r.id}]] · ${r.page || '?'} · ${(r.reported || '').slice(0, 10)}`
  const byBrand = (list) => {
    const groups = {}
    for (const r of list) (groups[r.brand] ||= []).push(r)
    return Object.entries(groups).map(([b, rs]) => `### ${b}\n\n${rs.map(line).join('\n')}`).join('\n\n')
  }
  fs.writeFileSync(path.join(VAULT, 'Index.md'), `# PROXe Issues

> Auto-generated by \`scripts/issues-sync/pull-issues.mjs\` — edit the issue notes, not this file.
> Last sync: ${new Date().toISOString()}

## Open (${open.length})

${byBrand(open) || '_Nothing open. Ship something._'}

## Fixed (${fixed.length})

${fixed.slice(0, 30).map((r) => `- ✅ [[${r.link}|${r.id}]] · ${r.brand} · ${(r.reported || '').slice(0, 10)}`).join('\n') || '_None yet._'}
`)

  console.log(`\nDone. ${created} new note(s)${DO_PUSH ? `, ${pushed} pushed back` : ''}. ${open.length} open / ${fixed.length} fixed.`)
}

main().catch((e) => { console.error(e); process.exit(1) })
