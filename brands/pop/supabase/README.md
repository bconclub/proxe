# PROXe — Master Supabase Schema

Single-file database setup for any new brand.

## Quick Start

1. **Create a Supabase project** at [supabase.com](https://supabase.com)

2. **Run the master schema** — open the SQL Editor and paste the contents of:
   ```
   000_master_schema.sql
   ```
   This creates all 15 tables, views, functions, triggers, RLS policies, and realtime subscriptions.

3. **Create your first admin user:**
   - Go to Authentication → Users → Add User
   - Sign up with email/password
   - The `handle_new_user()` trigger auto-creates a `dashboard_users` row with `role = 'viewer'`
   - Run `seed_admin.sql` (edit the email first) to upgrade to `admin`

4. **Set environment variables** in your brand's `.env.local`:
   ```env
   NEXT_PUBLIC_{BRAND}_SUPABASE_URL=https://your-project.supabase.co
   NEXT_PUBLIC_{BRAND}_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
   ```

## What's Included

| Category | Count | Details |
|----------|-------|---------|
| Tables | 15 | dashboard_users, user_invitations, dashboard_settings, dashboard_leads, all_leads, web_sessions, whatsapp_sessions, voice_sessions, social_sessions, conversations, lead_stage_changes, lead_stage_overrides, lead_activities, knowledge_base, knowledge_base_chunks |
| Views | 1 | unified_leads (joins all_leads + latest sessions) |
| Functions | 9 | Utility (4), scoring (3), search (1), auto-create lead (1) |
| Extensions | 1 | pgvector |

## Brand-Agnostic Design

The `brand` column on tables like `all_leads` and `knowledge_base` is `TEXT NOT NULL` — no hardcoded brand names in the schema. Any brand string works. Set the default brand in your app's environment variables, not in SQL.

## Files

| File | Purpose |
|------|---------|
| `000_master_schema.sql` | Complete database schema — run on a fresh project |
| `seed_admin.sql` | Template to create the first admin user |
| `README.md` | This file |
