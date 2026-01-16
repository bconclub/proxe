# Create Windchasers Login User - Step by Step

## ❌ Current Error: "Invalid login credentials" (400)

The Supabase connection is working, but the user `windchasersblr@gmail.com` doesn't exist in Supabase Auth yet.

## ✅ Solution: Create the User

### Option 1: Create via Supabase Dashboard (EASIEST)

1. **Go to Supabase Dashboard:**
   - URL: https://zboanatspldypfrtrkfp.supabase.co
   - Or go to https://supabase.com/dashboard and select your project

2. **Navigate to Authentication:**
   - Click **"Authentication"** in the left sidebar
   - Click **"Users"** tab

3. **Create New User:**
   - Click the **"Add user"** button (top right)
   - Select **"Create new user"**
   - Fill in:
     - **Email**: `windchasersblr@gmail.com`
     - **Password**: `Wind#826991`
     - ✅ **Check "Auto Confirm User"** (IMPORTANT - this skips email verification)
   - Click **"Create user"**

4. **Copy the User ID:**
   - After creation, you'll see the user in the list
   - **Copy the User ID** (it's a UUID like `123e4567-e89b-12d3-a456-426614174000`)

5. **Set Admin Role:**
   - Go to **SQL Editor** in Supabase
   - Run this SQL (replace `YOUR_USER_ID_HERE` with the actual User ID):

   ```sql
   INSERT INTO dashboard_users (id, email, role, full_name, is_active)
   VALUES (
     'YOUR_USER_ID_HERE'::uuid,
     'windchasersblr@gmail.com',
     'admin',
     'Windchasers Admin',
     true
   )
   ON CONFLICT (id) 
   DO UPDATE SET 
     role = 'admin',
     email = 'windchasersblr@gmail.com',
     is_active = true;
   ```

6. **Verify:**
   ```sql
   SELECT id, email, role, is_active 
   FROM dashboard_users 
   WHERE email = 'windchasersblr@gmail.com';
   ```

7. **Try Login Again:**
   - Go to: http://localhost:4001/auth/login
   - Email: `windchasersblr@gmail.com`
   - Password: `Wind#826991`
   - Click "Log in"

### Option 2: Check if User Already Exists

Run this SQL to check if the user exists:

```sql
-- Check auth users
SELECT id, email, email_confirmed_at, created_at 
FROM auth.users 
WHERE email = 'windchasersblr@gmail.com';

-- Check dashboard_users
SELECT id, email, role, is_active 
FROM dashboard_users 
WHERE email = 'windchasersblr@gmail.com';
```

**If user exists in auth.users but not in dashboard_users:**
```sql
-- Create dashboard_users entry from existing auth user
INSERT INTO dashboard_users (id, email, role, is_active)
SELECT id, email, 'admin', true
FROM auth.users 
WHERE email = 'windchasersblr@gmail.com'
ON CONFLICT (id) DO UPDATE SET role = 'admin';
```

**If user exists but password is wrong:**
1. Go to Authentication > Users
2. Find `windchasersblr@gmail.com`
3. Click the three dots menu
4. Select "Reset password" or "Update user"
5. Set new password

### Option 3: Use Google OAuth (Skip Password Issues)

1. Click **"Continue with Google"** button on login page
2. This bypasses password authentication
3. First time: User will be auto-created in Supabase Auth

## ⚠️ Common Issues

### Issue: "Email not confirmed"
- **Solution:** Check "Auto Confirm User" when creating user
- Or verify email in Supabase Auth settings

### Issue: User exists but still can't login
- **Solution:** Reset password in Supabase Auth UI
- Or use Google OAuth login

### Issue: dashboard_users table doesn't exist
- **Solution:** Run `doc/QUICK_FIX_DASHBOARD_USERS.sql` first

## 🔍 Quick Checklist

- [ ] User created in Supabase Auth (Authentication > Users)
- [ ] "Auto Confirm User" checked when creating user
- [ ] User ID copied from Auth
- [ ] dashboard_users entry created with admin role
- [ ] Dev server restarted after setting env vars
- [ ] Correct Supabase project (not PROXe project)
- [ ] Using correct email/password

## 📝 SQL Quick Reference

```sql
-- Create admin user entry (after creating in Auth UI)
INSERT INTO dashboard_users (id, email, role)
VALUES ('USER_ID_HERE', 'windchasersblr@gmail.com', 'admin')
ON CONFLICT (id) DO UPDATE SET role = 'admin';

-- Verify user exists
SELECT * FROM dashboard_users WHERE email = 'windchasersblr@gmail.com';

-- Check if dashboard_users table exists
SELECT EXISTS (
  SELECT FROM information_schema.tables 
  WHERE table_name = 'dashboard_users'
);
```
