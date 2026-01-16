# Troubleshooting Login Issues

## Common Issues After Restructure

### Issue: "Failed to fetch" Error

This usually means the Supabase client can't connect to your Supabase project.

### Quick Fixes

#### 1. Verify Environment Variables

Make sure your `.env.local` file (in `brand/windchasers/build/`) has:

```env
NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY=your-anon-key
```

**Important:** The variable names MUST start with `NEXT_PUBLIC_WINDCHASERS_` (not just `NEXT_PUBLIC_SUPABASE_`)

#### 2. Restart Dev Server

After updating `.env.local`, **always restart** the dev server:

```bash
# Stop the server (Ctrl+C)
# Then restart:
cd brand/windchasers/build
npm run dev
```

Next.js only loads environment variables at startup!

#### 3. Check Browser Console

Open browser DevTools (F12) and look for:

- ✅ `✅ Supabase client initialized` = Good!
- ❌ `❌ Supabase environment variables are not set!` = Missing env vars
- ❌ `ERR_NAME_NOT_RESOLVED` = Invalid URL or network issue

#### 4. Verify Supabase Project

1. Go to your Supabase dashboard
2. Check that your project is **active** (not paused)
3. Verify the URL matches exactly what's in `.env.local`
4. Make sure you're using the **Windchasers** project, not PROXe

#### 5. Test Connection

Visit: `http://localhost:4001/api/status`

This will show:
- Environment variables status
- Supabase connection status
- Detailed error messages

### Still Not Working?

1. **Check the URL format:**
   - Must start with `https://`
   - Must end with `.supabase.co`
   - Example: `https://abcdefghijklmnop.supabase.co`

2. **Check the anon key:**
   - Should be a long JWT token (starts with `eyJ...`)
   - Should be the "anon public" key, not the service_role key

3. **Clear browser cache:**
   - Hard refresh: Ctrl+Shift+R (or Cmd+Shift+R on Mac)
   - Or clear site data in DevTools

4. **Check network:**
   - Make sure you can access `https://your-project.supabase.co` in a browser
   - Check if there's a firewall blocking the connection

### After Restructure Checklist

- [ ] `.env.local` is in `brand/windchasers/build/` (not root)
- [ ] Variable names use `NEXT_PUBLIC_WINDCHASERS_` prefix
- [ ] Dev server was restarted after moving files
- [ ] Using correct Supabase project (Windchasers, not PROXe)
- [ ] Supabase project is active in dashboard
