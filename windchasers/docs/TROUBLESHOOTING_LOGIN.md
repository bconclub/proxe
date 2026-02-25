# Windchasers Login Troubleshooting Guide

## Common Login Errors

### Error: "Invalid email or password" (400 status)

This error means one of the following:

1. **User doesn't exist in Supabase Auth**
   - Solution: Create the user first in Supabase dashboard

2. **Wrong password**
   - Solution: Reset password or create new user

3. **Email not confirmed**
   - Solution: Check Supabase Auth settings or disable email confirmation

4. **Wrong Supabase project**
   - Solution: Verify `.env.local` has correct Windchasers Supabase credentials

## Step-by-Step Fix

### Step 1: Verify Environment Variables

Check your `windchasers/.env.local` file:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-windchasers-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-windchasers-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-windchasers-service-role-key
```

**Important:** Make sure these are Windchasers credentials, NOT PROXe credentials!

### Step 2: Create User in Supabase

1. Go to your **Windchasers** Supabase project dashboard
2. Navigate to **Authentication > Users**
3. Click **"Add user"** → **"Create new user"**
4. Enter:
   - Email: `windchasersblr@gmail.com` (or your email)
   - Password: `Wind#826991` (or your password)
   - **Auto Confirm User**: ✅ (check this to skip email verification)
5. Click **"Create user"**
6. **Copy the User ID** (you'll need it for Step 3)

### Step 3: Create dashboard_users Entry

Run this SQL in Supabase SQL Editor:

```sql
-- Insert dashboard_users entry with admin role
INSERT INTO dashboard_users (id, email, role)
VALUES ('YOUR_USER_ID_FROM_STEP_2', 'windchasersblr@gmail.com', 'admin')
ON CONFLICT (id) 
DO UPDATE SET role = 'admin', email = 'windchasersblr@gmail.com';
```

Replace `YOUR_USER_ID_FROM_STEP_2` with the actual user ID from Step 2.

### Step 4: Verify Database Tables Exist

Make sure you've run the database schema. Run this to check:

```sql
-- Check if dashboard_users table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'dashboard_users'
);
```

If it returns `false`, run `windchasers/doc/QUICK_FIX_DASHBOARD_USERS.sql` first.

### Step 5: Test Login

1. Restart your dev server:
   ```bash
   cd windchasers
   npm run dev
   ```

2. Go to: `http://localhost:4001/auth/login`

3. Enter your credentials:
   - Email: `windchasersblr@gmail.com`
   - Password: `Wind#826991`

4. Click **"Log in"**

## Debugging Steps

### Check Console Logs

Open browser DevTools (F12) and check:
- ✅ "Supabase client initialized" - means env vars are set
- ✅ "Login attempt" - means form submission worked
- ❌ "Supabase Auth Error" - check the error details

### Verify Supabase Connection

1. Check the console for Supabase URL:
   - Should show: `https://your-windchasers-project.supabase.co`
   - If it shows `placeholder.supabase.co`, env vars are missing

2. Test connection:
   ```bash
   curl https://your-windchasers-project.supabase.co/rest/v1/ \
     -H "apikey: your-anon-key"
   ```

### Check User Status in Supabase

Run this SQL to check your user:

```sql
-- Check auth user
SELECT id, email, email_confirmed_at, created_at 
FROM auth.users 
WHERE email = 'windchasersblr@gmail.com';

-- Check dashboard_users entry
SELECT id, email, role, is_active 
FROM dashboard_users 
WHERE email = 'windchasersblr@gmail.com';
```

## Quick Checklist

- [ ] `.env.local` exists in `windchasers/` folder
- [ ] `.env.local` has correct Windchasers Supabase URL
- [ ] `.env.local` has correct Windchasers Supabase anon key
- [ ] User exists in Supabase Auth (Authentication > Users)
- [ ] User has `email_confirmed_at` set (or Auto Confirm is enabled)
- [ ] `dashboard_users` table exists (run QUICK_FIX_DASHBOARD_USERS.sql)
- [ ] Entry exists in `dashboard_users` table for your user
- [ ] Dev server restarted after changing `.env.local`
- [ ] Using correct port: `http://localhost:4001` (not 3000)

## Still Not Working?

1. **Clear browser cache and localStorage:**
   ```javascript
   // In browser console
   localStorage.clear()
   sessionStorage.clear()
   ```

2. **Check Supabase Auth settings:**
   - Go to Authentication > Settings
   - Verify "Enable email confirmations" is OFF (for testing)
   - Or ensure email is confirmed

3. **Try Google OAuth:**
   - Click "Continue with Google" button
   - This bypasses password issues

4. **Check network tab:**
   - Open DevTools > Network
   - Look for failed requests to Supabase
   - Check response status codes and error messages
