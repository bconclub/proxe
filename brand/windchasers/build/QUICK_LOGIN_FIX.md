# Quick Login Fix Guide

## Step 1: Verify User Exists

**Most Common Issue:** User doesn't exist in Supabase Auth

### Check in Supabase Dashboard:
1. Go to: https://supabase.com/dashboard
2. Select your Windchasers project
3. Go to **Authentication** > **Users**
4. Search for: `windchasersblr@gmail.com`

**If user doesn't exist:**
1. Click **"Add User"** button
2. Enter:
   - Email: `windchasersblr@gmail.com`
   - Password: (set a password)
   - Auto Confirm User: ✅ (check this)
3. Click **"Create User"**

## Step 2: Create Dashboard User Entry

After creating the auth user, create the dashboard_users entry:

1. Go to **SQL Editor** in Supabase Dashboard
2. Run this query:

```sql
-- Get the user ID from auth.users
SELECT id, email 
FROM auth.users 
WHERE email = 'windchasersblr@gmail.com';

-- Then create dashboard_users entry (replace USER_ID with the id from above)
INSERT INTO dashboard_users (
  id,
  email,
  full_name,
  role,
  is_active
)
SELECT 
  id,
  email,
  'Windchasers Admin',
  'admin',
  true
FROM auth.users
WHERE email = 'windchasersblr@gmail.com'
ON CONFLICT (id) DO UPDATE SET
  email = EXCLUDED.email,
  is_active = true;
```

## Step 3: Test Login

1. Go to: http://localhost:4001/auth/login
2. Enter:
   - Email: `windchasersblr@gmail.com`
   - Password: (the password you set)
3. Click **"Log in"**

## Step 4: Check Browser Console

Open DevTools (F12) and look for:

**✅ Success indicators:**
- `✅ Login successful, user: windchasersblr@gmail.com`
- `✅ Session token available: true`
- `✅ Sync response: { success: true }`
- `✅ Session synced to cookies, redirecting...`

**❌ Error indicators:**
- `❌ Supabase Auth Error` - Check error message
- `Invalid login credentials` - User doesn't exist or wrong password
- `Rate limited` - Wait 10 minutes
- `Failed to fetch` - Network/Supabase project issue

## Step 5: Check Network Tab

1. Open DevTools > **Network** tab
2. Try logging in
3. Check these requests:

**`/auth/v1/token?grant_type=password`**
- Status should be: **200 OK**
- If **401**: Wrong email/password
- If **429**: Rate limited (wait 10 min)

**`/api/auth/sync-session`**
- Status should be: **200 OK**
- Response should be: `{ success: true }`
- If **401**: Session sync failed

**`/dashboard`**
- Should load dashboard (not redirect to login)
- If redirects to login: Session cookies not set

## Common Issues & Fixes

### Issue: "Invalid login credentials"
**Fix:** User doesn't exist. Create user in Supabase Dashboard (Step 1)

### Issue: Login succeeds but redirects back to login
**Fix:** Session cookies not being set. Check:
1. Browser console for cookie errors
2. Network tab - is `/api/auth/sync-session` returning 200?
3. Application > Cookies - do you see `sb-` cookies?

### Issue: "Rate limited"
**Fix:** 
- Wait 10 minutes
- Or clear: `localStorage.removeItem('rateLimitUntil')`
- Or use Google OAuth login

### Issue: "Failed to fetch"
**Fix:**
- Check if Supabase project is active (not paused)
- Check network connectivity
- Verify environment variables are set

## Quick Test Script

Run this in browser console on login page:

```javascript
// Test Supabase connection
const { createClient } = await import('/src/lib/supabase/client');
const supabase = createClient();

// Test login
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'windchasersblr@gmail.com',
  password: 'your-password-here'
});

console.log('Login test:', { data, error });

// If successful, check session
if (data?.session) {
  console.log('✅ Session:', data.session);
  console.log('✅ User:', data.user);
} else {
  console.log('❌ No session:', error);
}
```

## Still Not Working?

1. **Check exact error message** in browser console
2. **Check Network tab** for failed requests
3. **Verify user exists** in Supabase Dashboard
4. **Try incognito window** (rules out cache/cookie issues)
5. **Check if dev server was restarted** after changing .env.local

---

**Most likely fix:** Create the user in Supabase Dashboard > Authentication > Add User
