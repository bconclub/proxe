# 🔧 Fix: Supabase URL Cannot Be Resolved

## The Problem

Your Supabase URL `https://wflwsyaejscxmattmiskp.supabase.co` cannot be resolved (DNS error: NXDOMAIN).

This means:
- ❌ The domain doesn't exist
- ❌ The project ID might be incorrect
- ❌ The project might be paused or deleted

## The Solution

### Step 1: Get the Correct Supabase URL

1. **Go to Supabase Dashboard:**
   - Visit: https://supabase.com/dashboard
   - Log in with your account

2. **Select Your Windchasers Project:**
   - Make sure you're selecting the **Windchasers** project (not PROXe)
   - If you don't see a Windchasers project, you may need to create one

3. **Get the Project URL:**
   - Click on **Settings** (gear icon) in the left sidebar
   - Click on **API** in the settings menu
   - Under **Project URL**, you'll see something like:
     ```
     https://abcdefghijklmnop.supabase.co
     ```
   - **Copy this entire URL**

### Step 2: Update .env.local

1. **Open the file:**
   ```bash
   cd brand/windchasers/build
   nano .env.local
   # or use your preferred editor
   ```

2. **Find this line:**
   ```env
   NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL=https://wflwsyaejscxmattmiskp.supabase.co
   ```

3. **Replace with your correct URL:**
   ```env
   NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL=https://your-actual-project-id.supabase.co
   ```

4. **Also get the anon key:**
   - In the same Supabase Settings > API page
   - Under **Project API keys** > **anon public**
   - Copy the key (it's a long JWT token starting with `eyJ...`)
   - Update this line in `.env.local`:
     ```env
     NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY=your-actual-anon-key-here
     ```

### Step 3: Restart Dev Server

**IMPORTANT:** After updating `.env.local`:

```bash
# Stop the server (Ctrl+C)
# Then restart:
cd brand/windchasers/build
npm run dev
```

### Step 4: Verify

1. **Check the status endpoint:**
   - Visit: http://localhost:4001/api/status
   - Look for `"canReachSupabase": true`

2. **Try logging in again**

## If You Don't Have a Windchasers Project

If you don't see a Windchasers project in your Supabase dashboard:

### Option 1: Create a New Project
1. Go to https://supabase.com/dashboard
2. Click **New Project**
3. Name it "Windchasers" (or similar)
4. Choose your organization
5. Set a database password
6. Wait for project to be created (~2 minutes)
7. Get the URL and keys from Settings > API

### Option 2: Use an Existing Project
If you have another Supabase project you want to use:
1. Go to that project's Settings > API
2. Copy the Project URL and anon key
3. Update `.env.local` with those values

## Common Mistakes

❌ **Wrong project:** Using PROXe project URL instead of Windchasers  
✅ **Fix:** Make sure you're using the Windchasers project

❌ **Typo in URL:** Missing characters or wrong project ID  
✅ **Fix:** Copy-paste directly from Supabase dashboard

❌ **Project paused:** Free tier projects pause after inactivity  
✅ **Fix:** Go to Supabase dashboard and resume the project

❌ **Old/deleted project:** Project was deleted  
✅ **Fix:** Create a new project or use a different one

## Quick Test

After updating, test the URL manually:

```bash
# Replace with your actual URL
ping your-project-id.supabase.co
```

If this fails, the URL is definitely wrong.
