# Quick Migration Guide - Fix "unified_leads view does not exist"

## Step 1: Open Supabase SQL Editor

1. Go to your Supabase project dashboard: https://app.supabase.com
2. Select your project
3. Click **"SQL Editor"** in the left sidebar
4. Click **"New query"** button

## Step 2: Run Migrations in Order

Run each migration file **one at a time** in this exact order:

### Migration 1: Base Schema
1. Open `supabase/migrations/001_dashboard_schema.sql` in your code editor
2. Copy **ALL** the contents
3. Paste into the Supabase SQL Editor
4. Click **"Run"** (or press Ctrl+Enter)
5. Wait for "Success" message

### Migration 2: Unified Leads View
**IMPORTANT:** Choose the correct migration based on your setup:

#### Option A: If you have a `sessions` table (recommended)
1. Open `supabase/migrations/003_update_unified_leads_with_sessions.sql`
2. Copy **ALL** the contents
3. Paste into SQL Editor
4. Click **"Run"**
5. **Skip migration 002** (003 replaces it)

#### Option B: If you DON'T have a `sessions` table
1. Open `supabase/migrations/002_unified_leads_view.sql`
2. Copy **ALL** the contents
3. Paste into SQL Editor
4. Click **"Run"**

### Migration 3: Data Migration (if needed)
If you have existing data in `dashboard_leads` and want to migrate it:
1. Open `supabase/migrations/004_migrate_and_remove_dashboard_leads.sql`
2. Copy **ALL** the contents
3. Paste into SQL Editor
4. Click **"Run"**

## Step 3: Verify the View Exists

Run this query in SQL Editor to verify:

```sql
SELECT * FROM unified_leads LIMIT 1;
```

If it runs without errors, the view is created successfully!

## Troubleshooting

### Error: "relation 'sessions' does not exist"
- You don't have a `sessions` table yet
- Use **Migration 2 Option B** (002_unified_leads_view.sql) instead
- Or create your `sessions` table first

### Error: "permission denied"
- Make sure you're running queries as the project owner
- Check that RLS policies are set correctly

### Error: "relation 'dashboard_leads' does not exist"
- Run Migration 1 (001_dashboard_schema.sql) first
- This creates the `dashboard_leads` table

## After Running Migrations

1. Refresh your browser on the Leads page
2. The error should be gone
3. If you see "No leads found", that's normal - you just need to add some lead data

