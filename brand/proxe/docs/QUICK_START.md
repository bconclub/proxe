# Quick Start Guide - PROXe COMMAND CENTER

## First Time Setup

### Step 1: Configure Supabase

1. Create a `.env.local` file in the root directory
2. Add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key-here
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

### Step 2: Set Up Database

1. Go to your Supabase project dashboard
2. Navigate to SQL Editor
3. Run these migrations in order:
   - Copy and paste contents of `supabase/migrations/001_dashboard_schema.sql`
   - Copy and paste contents of `supabase/migrations/007_rename_sessions_to_all_leads.sql`
   - Copy and paste contents of `supabase/migrations/008_update_unified_leads_view.sql`
   - Copy and paste contents of `supabase/migrations/009_fix_unified_leads_view_rls.sql`

### Step 3: Create Your First Account

**Option A: Use the Signup Page (Easiest)**
1. Go to http://localhost:3000/auth/signup
2. Fill in:
   - Full Name
   - Email address
   - Password (min 6 characters)
   - Confirm Password
3. Click "Create Account"
4. You'll be redirected to login page
5. Login with your email and password

**Option B: Create via Supabase Dashboard**
1. Go to Supabase Dashboard > Authentication > Users
2. Click "Add User" > "Create new user"
3. Enter email and password
4. Click "Create User"

### Step 4: Make Yourself Admin (Optional)

After creating your account, make yourself an admin:

1. Go to Supabase Dashboard > SQL Editor
2. Find your user ID in Authentication > Users (copy the UUID)
3. Run this SQL:

```sql
UPDATE dashboard_users 
SET role = 'admin' 
WHERE email = 'your-email@example.com';
```

Or by user ID:

```sql
UPDATE dashboard_users 
SET role = 'admin' 
WHERE id = 'your-user-uuid-here';
```

## Login Credentials

- **Email**: The email you used to sign up
- **Password**: The password you set during signup

**Note**: This is NOT a username/password system - it uses **email/password** authentication.

## Troubleshooting

### "Invalid login credentials"
- Make sure you created an account first (use `/auth/signup`)
- Check that your Supabase environment variables are correct
- Verify the user exists in Supabase Dashboard > Authentication > Users

### "Supabase client error"
- Make sure `.env.local` file exists with correct credentials
- Restart the dev server after adding environment variables

### Can't access dashboard after login
- Check that database migrations ran successfully
- Verify `dashboard_users` table exists and has your user
- Check browser console for errors


