#!/usr/bin/env node
/**
 * Pulse of Punjab (POP) - database setup runner.
 *
 * Connects to the POP Supabase Postgres using DATABASE_URL from
 * brands/pop/agent/.env.local (env-driven, no MCP) and runs the canonical
 * schema. Brand-agnostic schema is shared with master; grievance vars live in
 * all_leads.metadata jsonb, so NO pop-specific DDL is needed.
 *
 * Commands:
 *   node apply.js list     # list existing tables in the public schema (read-only)
 *   node apply.js reset     # DROP everything in public, then recreate (DESTRUCTIVE)
 *   node apply.js apply     # run 000_master_schema.sql + migrations in order (default)
 *
 * `reset` is gated behind POP_DB_CONFIRM=DROP in the env or --yes on the CLI.
 *
 * Requires the `pg` package:  npm i pg --prefix ../agent
 */

const fs = require('fs');
const path = require('path');

// --- load env from ../agent/.env.local --------------------------------------
function loadEnv() {
  const envPath = path.join(__dirname, '..', 'agent', '.env.local');
  if (!fs.existsSync(envPath)) throw new Error(`env not found: ${envPath}`);
  const out = {};
  for (const raw of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    out[k] = v;
  }
  return out;
}

function requirePg() {
  try {
    return require(path.join(__dirname, '..', 'agent', 'node_modules', 'pg'));
  } catch {
    try { return require('pg'); } catch {
      console.error('\n[apply] The `pg` package is not installed.');
      console.error('         Run:  npm i pg --prefix brands/pop/agent\n');
      process.exit(1);
    }
  }
}

async function main() {
  const env = loadEnv();
  const cmd = (process.argv[2] || 'apply').toLowerCase();
  const yes = process.argv.includes('--yes') || env.POP_DB_CONFIRM === 'DROP';

  const connectionString = env.DATABASE_URL;
  if (!connectionString) {
    console.error('\n[apply] DATABASE_URL missing in brands/pop/agent/.env.local');
    console.error('         Supabase: Project Settings > Database > Connection string > URI');
    console.error('         postgresql://postgres:<pwd>@db.<ref>.supabase.co:5432/postgres\n');
    process.exit(1);
  }

  // Guard: never let this run against a non-pop project by accident.
  const popRef = (env.NEXT_PUBLIC_POP_SUPABASE_URL || '').match(/https:\/\/([a-z0-9]+)\.supabase/i)?.[1];
  if (popRef && !connectionString.includes(popRef)) {
    console.error(`\n[apply] SAFETY STOP: DATABASE_URL host does not match NEXT_PUBLIC_POP_SUPABASE_URL ref (${popRef}).`);
    console.error('         Refusing to run against a different project.\n');
    process.exit(1);
  }

  const { Client } = requirePg();
  const client = new Client({ connectionString, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log('[apply] connected:', connectionString.replace(/:[^:@/]+@/, ':****@'));

  try {
    if (cmd === 'list') {
      const r = await client.query(
        `select table_name from information_schema.tables
         where table_schema='public' order by table_name`
      );
      console.log(`\n[apply] public schema has ${r.rows.length} table(s):`);
      r.rows.forEach((row) => console.log('  -', row.table_name));
      return;
    }

    if (cmd === 'reset') {
      if (!yes) {
        console.error('\n[apply] reset is DESTRUCTIVE - drops EVERYTHING in the public schema.');
        console.error('         Re-run with --yes (or set POP_DB_CONFIRM=DROP) to confirm.\n');
        process.exit(1);
      }
      console.log('[apply] dropping public schema (DROP SCHEMA public CASCADE)...');
      await client.query('DROP SCHEMA IF EXISTS public CASCADE;');
      await client.query('CREATE SCHEMA public;');
      await client.query('GRANT ALL ON SCHEMA public TO postgres;');
      await client.query('GRANT ALL ON SCHEMA public TO public;');
      await client.query('GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;');
      // CRITICAL: DROP SCHEMA public wipes Supabase's default privileges, so
      // tables created afterward have NO grants for the API roles -> PostgREST
      // returns 42501 "permission denied" for every table. Re-establish default
      // privileges so all tables created by `apply` are reachable via the API.
      await client.query(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;'
      );
      await client.query(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;'
      );
      await client.query(
        'ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON FUNCTIONS TO anon, authenticated, service_role;'
      );
      console.log('[apply] public schema reset (+default privileges). Now run: node apply.js apply');
      return;
    }

    // default: apply
    const files = [path.join(__dirname, '000_master_schema.sql')];
    const migDir = path.join(__dirname, 'migrations');
    if (fs.existsSync(migDir)) {
      for (const f of fs.readdirSync(migDir).filter((f) => f.endsWith('.sql')).sort()) {
        files.push(path.join(migDir, f));
      }
    }
    for (const file of files) {
      const sql = fs.readFileSync(file, 'utf8');
      process.stdout.write(`[apply] running ${path.basename(file)} ... `);
      await client.query(sql);
      console.log('ok');
    }
    const r = await client.query(
      `select count(*)::int as n from information_schema.tables where table_schema='public'`
    );
    console.log(`[apply] done. public schema now has ${r.rows[0].n} table(s).`);
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error('[apply] ERROR:', e.message); process.exit(1); });
