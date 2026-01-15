# Supabase Auth Debug Guide

## 🔍 Current Auth Check Code

### 1. Dashboard Layout (`src/app/dashboard/layout.tsx`)
- **Location**: Server-side check before rendering dashboard
- **Behavior**: 
  - Calls `supabase.auth.getUser()`
  - Redirects to `/auth/login` if no user or error (400/401)
  - Allows access on rate limit (429)
  - In development, allows access on other errors with warning

### 2. Middleware (`middleware.ts` + `src/lib/supabase/middleware.ts`)
- **Location**: Runs on every request (except API/static/auth pages)
- **Behavior**:
  - Updates session cookies
  - Calls `supabase.auth.getUser()` but doesn't block (only logs)
  - Clears invalid cookies on 400 error
  - Continues on rate limits

### 3. Root Page (`src/app/page.tsx`)
- **Location**: Initial redirect
- **Behavior**: Redirects to `/dashboard` if authenticated, `/auth/login` if not

---

## ⚠️ Environment Variables Status

**CRITICAL ISSUE FOUND**: `.env.local` file does not exist!

### Required Variables:
```bash
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key-here
```

### How to Fix:
1. Copy `env.example.txt` to `.env.local`:
   ```bash
   cp env.example.txt .env.local
   ```

2. Fill in your Supabase credentials:
   - Get URL and anon key from: https://app.supabase.com → Your Project → Settings → API

3. Restart Next.js dev server:
   ```bash
   npm run dev
   ```

---

## 🛠️ Debug Endpoints

### Check Auth Status
Visit: `http://localhost:3000/api/debug-auth`

This endpoint shows:
- ✅ Environment variables status
- ✅ Supabase client creation
- ✅ Auth check result
- ✅ Recommendations

### Check Connection
Visit: `http://localhost:3000/api/test-connection`

This endpoint shows:
- ✅ Environment variables
- ✅ Network connectivity
- ✅ Database access

---

## 🚀 Development Bypass Options

### Option 1: Environment Variable Bypass
1. Add to `.env.local`:
   ```bash
   BYPASS_AUTH=true
   ```

2. Uncomment in `src/app/dashboard/layout.tsx` (lines 13-20):
   ```typescript
   if (process.env.NODE_ENV === 'development' && process.env.BYPASS_AUTH === 'true') {
     console.warn('⚠️ AUTH BYPASSED: Development mode with BYPASS_AUTH=true')
     return (
       <ThemeProvider>
         <DashboardLayout>{children}</DashboardLayout>
       </ThemeProvider>
     )
   }
   ```

### Option 2: Temporary Comment Out
In `src/app/dashboard/layout.tsx`, comment out the auth check:
```typescript
// const { data: { user }, error } = await supabase.auth.getUser()
// if (!user) redirect('/auth/login')
```

---

## 🔧 Common Issues & Solutions

### Issue 1: "Environment variables not set"
**Solution**: Create `.env.local` with Supabase credentials

### Issue 2: "Invalid session (400)"
**Solution**: 
- Clear browser cookies
- Check Supabase project is active
- Verify anon key is correct

### Issue 3: "Rate limited (429)"
**Solution**: 
- Wait 5-10 minutes
- Check Supabase dashboard for rate limit status
- Current code allows access even when rate limited

### Issue 4: "Unauthorized (401)"
**Solution**:
- Verify `NEXT_PUBLIC_SUPABASE_ANON_KEY` is correct
- Check Supabase project settings
- Ensure key hasn't been rotated

### Issue 5: "No user found"
**Solution**:
- Visit `/auth/login` to authenticate
- Check if user exists in Supabase Auth dashboard
- Verify email confirmation if required

---

## 📊 Current Auth Flow

```
User Request
    ↓
Middleware (updates session, doesn't block)
    ↓
Dashboard Layout (checks auth)
    ↓
├─ Has User → Render Dashboard ✅
├─ No User → Redirect to /auth/login ❌
├─ Error 400/401 → Redirect to /auth/login ❌
├─ Error 429 → Allow access (rate limited) ⚠️
└─ Other Error → Allow in dev, block in prod ⚠️
```

---

## 🧪 Testing Steps

1. **Check environment variables**:
   ```bash
   curl http://localhost:3000/api/debug-auth
   ```

2. **Test auth flow**:
   - Visit `http://localhost:3000`
   - Should redirect to `/auth/login` if not authenticated
   - After login, should redirect to `/dashboard`

3. **Check console logs**:
   - Look for `🔍 Dashboard layout auth check:` in terminal
   - Look for `🔍 Middleware auth check:` in terminal

4. **Test bypass** (development only):
   - Set `BYPASS_AUTH=true` in `.env.local`
   - Uncomment bypass code in layout
   - Restart server
   - Should access dashboard without login

---

## 📝 Next Steps

1. ✅ Create `.env.local` with Supabase credentials
2. ✅ Restart dev server
3. ✅ Visit `/api/debug-auth` to verify setup
4. ✅ Test login flow
5. ✅ If still blocked, use development bypass temporarily
