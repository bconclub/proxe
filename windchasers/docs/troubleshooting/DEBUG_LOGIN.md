# Debug Login Issues

## Common Login Problems

### 1. User Doesn't Exist in Supabase Auth

**Symptom:** Login fails with "Invalid login credentials"

**Fix:**
1. Go to Supabase Dashboard > Authentication > Users
2. Check if your user exists
3. If not, create a user:
   - Click "Add User" 
   - Enter email: `windchasersblr@gmail.com`
   - Set password
   - Or use the SQL script below

### 2. Session Not Syncing to Cookies

**Symptom:** Login succeeds but redirects back to login page

**Check:**
1. Open browser DevTools > Application > Cookies
2. Look for cookies starting with `sb-` (Supabase cookies)
3. If missing, the sync-session API might be failing

**Fix:**
- Check browser console for errors
- Check Network tab for `/api/auth/sync-session` request
- Verify the response is 200 OK

### 3. Dashboard Can't Read Session

**Symptom:** Login works, redirects to dashboard, but dashboard redirects back to login

**Check:**
- Open browser console on dashboard page
- Look for: `🔍 Dashboard layout auth check`
- Check if `hasUser: false` even after login

**Possible causes:**
- Cookies not being sent with requests
- CORS issues
- Domain mismatch (localhost vs 127.0.0.1)

### 4. Rate Limiting

**Symptom:** "Rate limited" error after multiple attempts

**Fix:**
- Wait 10 minutes
- Or use Google OAuth login
- Or clear rate limit in localStorage:
  ```javascript
  localStorage.removeItem('rateLimitUntil')
  ```

## Quick Diagnostic Steps

### Step 1: Check if User Exists

Run in Supabase SQL Editor:
```sql
SELECT id, email, created_at 
FROM auth.users 
WHERE email = 'windchasersblr@gmail.com';
```

If no results, create the user (see below).

### Step 2: Test Login Directly

Open browser console on login page and run:
```javascript
// Test Supabase client
const supabase = window.supabase || (await import('/src/lib/supabase/client')).createClient();
const { data, error } = await supabase.auth.signInWithPassword({
  email: 'windchasersblr@gmail.com',
  password: 'your-password'
});
console.log('Login result:', { data, error });
```

### Step 3: Check Cookies After Login

After attempting login, check:
```javascript
// In browser console
document.cookie.split(';').filter(c => c.includes('sb-'))
```

Should see Supabase session cookies.

### Step 4: Check Network Requests

1. Open DevTools > Network tab
2. Try logging in
3. Check these requests:
   - `/auth/v1/token?grant_type=password` - Should be 200 OK
   - `/api/auth/sync-session` - Should be 200 OK
   - `/dashboard` - Should not redirect to login

## Create User Script

If user doesn't exist, run this in Supabase SQL Editor:

```sql
-- Create user in auth.users
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  recovery_sent_at,
  last_sign_in_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  gen_random_uuid(),
  'authenticated',
  'authenticated',
  'windchasersblr@gmail.com',
  crypt('your-password-here', gen_salt('bf')),
  NOW(),
  NOW(),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
)
ON CONFLICT (email) DO NOTHING;

-- Create dashboard_users entry
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

**Or use Supabase Dashboard:**
1. Go to Authentication > Users
2. Click "Add User"
3. Enter email and password
4. Click "Create User"

## Test Login Flow

1. **Clear everything:**
   ```javascript
   // In browser console
   localStorage.clear();
   document.cookie.split(";").forEach(c => {
     document.cookie = c.replace(/^ +/, "").replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
   });
   ```

2. **Reload page and try login**

3. **Check console logs:**
   - Should see: `✅ Login successful`
   - Should see: `✅ Session synced to cookies`
   - Should see: `✅ Supabase client initialized`

4. **Check Network tab:**
   - `/api/auth/sync-session` should return 200
   - Response should have `{ success: true }`

## Still Not Working?

1. **Check browser console for exact error**
2. **Check Network tab for failed requests**
3. **Verify Supabase project is active** (not paused)
4. **Try incognito/private window** (rules out cookie/cache issues)
5. **Check if using correct Supabase project** (Windchasers, not PROXe)
