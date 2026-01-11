# Setup Instructions

## 1. Database Setup

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run the migrations in order:
   - `supabase/migrations/001_dashboard_schema.sql`
   - `supabase/migrations/007_rename_sessions_to_all_leads.sql`
   - `supabase/migrations/008_update_unified_leads_view.sql`
   - `supabase/migrations/009_fix_unified_leads_view_rls.sql`

## 2. Enable Realtime

1. In Supabase dashboard, go to Database > Replication
2. Enable replication for the `chat_sessions` table
3. This allows real-time updates in the dashboard

## 3. Create Admin User

### Option A: Using Supabase Auth UI
1. Go to Authentication > Users in Supabase dashboard
2. Create a new user with email/password
3. Note the user ID
4. Run this SQL in the SQL Editor:

```sql
UPDATE dashboard_users 
SET role = 'admin' 
WHERE id = 'your-user-id-here';
```

### Option B: Using the App
1. Sign up through the app at `/auth/login`
2. Then update your role to admin using the SQL above

## 4. Environment Variables

Create a `.env.local` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

## 5. Install Dependencies

```bash
npm install
```

## 6. Run Development Server

```bash
npm run dev
```

## 7. Access the Dashboard

1. Go to http://localhost:3000
2. Login with your admin credentials
3. You should see the dashboard

## Troubleshooting

### Real-time updates not working
- Check that Realtime is enabled for `chat_sessions` table
- Verify your Supabase project has Realtime enabled
- Check browser console for errors

### Can't see leads
- Verify `chat_sessions` table exists and has data
- Check that the `unified_leads` view was created successfully
- Verify RLS policies allow authenticated users to read data

### Authentication issues
- Check that `dashboard_users` table has your user
- Verify RLS policies on `dashboard_users` table
- Check Supabase Auth settings


