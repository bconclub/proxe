# Windchasers Environment Variables Setup

## ❌ Current Issue: Missing Supabase Credentials

Your `.env.local` file is missing the required Supabase credentials. This causes the "Failed to fetch" error during login.

## ✅ How to Fix

### Step 1: Get Your Windchasers Supabase Credentials

1. Go to your **Windchasers** Supabase project dashboard
2. Navigate to **Settings** (gear icon) → **API**
3. Copy these values:
   - **Project URL** (under "Project URL")
   - **anon public** key (under "Project API keys" > "anon public")
   - **service_role** key (under "Project API keys" > "service_role") - Keep this secret!

### Step 2: Update `.env.local`

Add these lines to your `windchasers/.env.local` file:

```env
# Windchasers Supabase Configuration (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://your-windchasers-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-windchasers-anon-key-here
SUPABASE_SERVICE_ROLE_KEY=your-windchasers-service-role-key-here

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:4001
```

**Replace:**
- `your-windchasers-project` with your actual Supabase project ID
- `your-windchasers-anon-key-here` with your actual anon key
- `your-windchasers-service-role-key-here` with your actual service role key

### Step 3: Complete `.env.local` Example

Your `windchasers/.env.local` should look like this:

```env
# Windchasers Supabase Configuration (REQUIRED)
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:4001

# Existing API Keys (keep these)
CLAUDE_API_KEY=sk-ant-api03-...
GOOGLE_SERVICE_ACCOUNT_EMAIL=web-proxe@...
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n..."
```

### Step 4: Restart Dev Server

**IMPORTANT:** After updating `.env.local`, you MUST restart the dev server:

1. Stop the current server (Ctrl+C)
2. Start it again:
   ```bash
   cd windchasers
   npm run dev
   ```

### Step 5: Verify Environment Variables

Open the browser console and check for:
- ✅ "Supabase client initialized" (means env vars are loaded)
- ❌ "Supabase environment variables are not set!" (means env vars are missing)

## 🔍 Quick Test

After setting up env vars, check:
```
http://localhost:4001/api/status
```

This endpoint will show your Supabase connection status.

## ⚠️ Important Notes

1. **Use Windchasers credentials, NOT PROXe credentials**
   - Make sure you're using the correct Supabase project
   - Windchasers and PROXe have separate Supabase projects

2. **Never commit `.env.local` to git**
   - It's already in `.gitignore`
   - Contains sensitive keys

3. **Restart required after changes**
   - Next.js only loads `.env.local` at startup
   - Always restart after modifying environment variables
