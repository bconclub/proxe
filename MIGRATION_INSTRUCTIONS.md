# Database Migration Instructions - Fix 502 Error

## Problem
The dashboard code has been updated to use the new multi-touchpoint schema (`all_leads`, `web_sessions`, etc.), but the migration hasn't been run on your VPS Supabase database yet. This causes a 502 error because the app tries to query tables that don't exist.

## Solution: Run the Migration

### Step 1: Access Supabase SQL Editor
1. Go to your Supabase project: https://supabase.com/dashboard
2. Select your project
3. Click on **SQL Editor** in the left sidebar
4. Click **New query**

### Step 2: Run the Migration
1. Open the file: `supabase/migrations/007_rename_sessions_to_all_leads.sql`
2. Copy the entire contents
3. Paste into the Supabase SQL Editor
4. Click **Run** (or press Ctrl+Enter)

### Step 3: Verify Migration Success
After running, verify the tables were created:

```sql
-- Check if tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('all_leads', 'web_sessions', 'whatsapp_sessions', 'voice_sessions', 'social_sessions', 'messages', 'unified_leads')
ORDER BY table_name;
```

You should see all 7 tables listed.

### Step 4: Check Data Migration
Verify existing data was migrated:

```sql
-- Check all_leads count (should match web sessions from old sessions table)
SELECT COUNT(*) FROM all_leads;

-- Check web_sessions count
SELECT COUNT(*) FROM web_sessions;

-- Check unified_leads view works
SELECT COUNT(*) FROM unified_leads;
```

### Step 5: Restart the Dashboard
After migration, the dashboard should work. The app will automatically use the new schema.

## What the Migration Does

1. **Creates `normalize_phone()` function** - For phone number normalization
2. **Creates `all_leads` table** - Minimal unifier table
3. **Creates channel tables** - `web_sessions`, `whatsapp_sessions`, `voice_sessions`, `social_sessions`
4. **Creates `messages` table** - Universal message log
5. **Migrates existing data** - Moves web sessions from `sessions` to `all_leads` + `web_sessions`
6. **Creates `unified_leads` view** - For dashboard display
7. **Sets up RLS policies** - Security policies for all tables
8. **Enables Realtime** - For real-time updates

## Important Notes

- **The old `sessions` table is NOT deleted** - It's kept for reference
- **Only web sessions are migrated** - Other channels will be added as they're used
- **No data loss** - All existing data is preserved
- **Safe to run multiple times** - Uses `IF NOT EXISTS` and `DROP IF EXISTS`

## Troubleshooting

### If migration fails:
1. Check the error message in Supabase SQL Editor
2. Common issues:
   - Missing `sessions` table (if you already deleted it)
   - Constraint violations (duplicate phone numbers)
   - Permission issues

### If dashboard still shows 502:
1. Check PM2 logs on VPS: `pm2 logs dashboard`
2. Look for errors about missing tables
3. Verify migration ran successfully (Step 3 above)
4. Restart PM2: `pm2 restart dashboard`

## After Migration

Once the migration is complete:
- ✅ Dashboard will work on VPS
- ✅ New webhooks will use new schema
- ✅ Real-time updates will work
- ✅ All existing data is preserved

