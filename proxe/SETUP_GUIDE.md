# Complete Setup Guide - PROXe COMMAND CENTER

## Step 1: Supabase Project Setup

### 1.1 Create Supabase Project
1. Go to [https://supabase.com](https://supabase.com)
2. Sign in or create an account
3. Click **"New Project"**
4. Fill in:
   - **Name**: PROXe Command Center (or your preferred name)
   - **Database Password**: Create a strong password (save it!)
   - **Region**: Choose closest to your users
   - **Pricing Plan**: Free tier is fine to start
5. Click **"Create new project"**
6. Wait 2-3 minutes for project to initialize

### 1.2 Get Your Supabase Credentials
1. In your Supabase project dashboard, go to **Settings** (gear icon) > **API**
2. Copy these values:
   - **Project URL** (under "Project URL")
   - **anon public** key (under "Project API keys" > "anon public")
   - **service_role** key (under "Project API keys" > "service_role") - Keep this secret!

## Step 2: Database Setup

### 2.1 Run Database Migrations
1. In Supabase dashboard, go to **SQL Editor** (left sidebar)
2. Click **"New query"**
3. Copy and paste the contents of `supabase/migrations/001_dashboard_schema.sql`
4. Click **"Run"** (or press Ctrl+Enter)
5. Wait for success message
6. Create a new query and paste contents of `supabase/migrations/007_rename_sessions_to_all_leads.sql`
7. Click **"Run"**
8. Create a new query and paste contents of `supabase/migrations/008_update_unified_leads_view.sql`
9. Click **"Run"**
10. Create a new query and paste contents of `supabase/migrations/009_fix_unified_leads_view_rls.sql`
11. Click **"Run"**
12. All migrations should complete successfully

### 2.2 Enable Realtime
1. Go to **Database** > **Replication** (left sidebar)
2. Find `chat_sessions` table in the list
3. Toggle the switch to **enable replication** for `chat_sessions`
4. This enables real-time updates in the dashboard

## Step 3: Create Admin User

### 3.1 Create Auth User
**Location: Supabase Dashboard → Authentication → Users**

**⚠️ If you get "Database error creating new user":**
1. First, run the fix script in SQL Editor: `scripts/fix-user-creation.sql`
2. Or see "Troubleshooting" section below for manual workaround

**Normal Steps:**
1. In your Supabase project dashboard (https://app.supabase.com), look at the **left sidebar**
2. Click on **"Authentication"** (icon looks like a key/shield)
3. In the Authentication submenu, click **"Users"**
4. You'll see a list of users (probably empty if new project)
5. Click the **"Add User"** button (usually top-right, green button)
6. A modal will pop up - select **"Create new user"** tab
7. Fill in the form:
   - **Email**: `proxeadmin@proxe.com`
   - **Password**: `proxepass`
   - ✅ **Check the box** "Auto Confirm User" (important!)
8. Click **"Create User"** button
9. After creation, you'll see the user in the list
10. **Click on the user** to open details, or look at the table - find the **"UUID"** column
11. **Copy the entire UUID** (it looks like: `123e4567-e89b-12d3-a456-426614174000`) - you'll need this next

**Visual Guide:**
- Left Sidebar → Authentication → Users → Add User → Create new user tab

**Troubleshooting "Database error creating new user":**
If you get this error, the trigger might be failing. Try this:

1. **Option A - Fix the trigger:**
   - Go to SQL Editor
   - Run the contents of `scripts/fix-user-creation.sql`
   - Try creating the user again

2. **Option B - Manual workaround:**
   - Temporarily disable the trigger:
   ```sql
   DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
   ```
   - Create the auth user (should work now)
   - Manually create dashboard_user entry:
   ```sql
   INSERT INTO dashboard_users (id, email, role)
   VALUES ('PASTE_USER_ID_HERE', 'proxeadmin@proxe.com', 'viewer')
   ON CONFLICT (id) DO NOTHING;
   ```
   - Re-enable the trigger:
   ```sql
   CREATE TRIGGER on_auth_user_created
     AFTER INSERT ON auth.users
     FOR EACH ROW EXECUTE FUNCTION handle_new_user();
   ```

### 3.2 Set Admin Role
**Location: Supabase Dashboard → SQL Editor**

1. In your Supabase dashboard, click **"SQL Editor"** in the left sidebar (icon looks like a database/terminal)
2. Click **"New query"** button (top-left)
3. You'll see a blank SQL editor
4. Paste this SQL (replace `USER_ID_HERE` with the UUID you copied from step 3.1):

```sql
UPDATE dashboard_users 
SET role = 'admin' 
WHERE id = 'USER_ID_HERE';
```

**Example:** If your UUID is `abc123-def456-ghi789`, it would look like:
```sql
UPDATE dashboard_users 
SET role = 'admin' 
WHERE id = 'abc123-def456-ghi789';
```

5. Click **"Run"** button (or press `Ctrl+Enter` / `Cmd+Enter`)
6. You should see "Success. No rows returned"
7. To verify it worked, run this query:

```sql
SELECT id, email, role FROM dashboard_users WHERE email = 'proxeadmin@proxe.com';
```

8. You should see one row with `role = 'admin'`

**Visual Guide:**
- Left Sidebar → SQL Editor → New Query → Paste SQL → Run

## Step 4: Configure Google OAuth (Optional but Recommended)

### 4.1 Get Google OAuth Credentials
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select existing
3. Go to **APIs & Services** > **Credentials**
4. Click **"Create Credentials"** > **"OAuth client ID"**
5. Choose **"Web application"**
6. Add authorized redirect URIs:
   - `https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`
   - (Find your project ref in Supabase Settings > General)
7. Copy **Client ID** and **Client Secret**

### 4.2 Configure in Supabase
1. In Supabase dashboard, go to **Authentication** > **Providers**
2. Find **Google** and click to expand
3. Toggle **"Enable Google provider"**
4. Paste your **Client ID** and **Client Secret**
5. Click **"Save"**

## Step 5: Environment Variables Setup

### 5.1 Create .env.local File
1. In your project root (`Command Center` folder), create a file named `.env.local`
2. Add the following content:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here

# App Configuration
NEXT_PUBLIC_APP_URL=http://localhost:3000

# Integration APIs (Optional - for future use)
WEB_AGENT_API_URL=
WEB_AGENT_API_KEY=
WHATSAPP_API_URL=
WHATSAPP_API_KEY=
VOICE_API_URL=
VOICE_API_KEY=

# Google Calendar Integration (Optional)
GOOGLE_CALENDAR_CLIENT_ID=
GOOGLE_CALENDAR_CLIENT_SECRET=
GOOGLE_CALENDAR_REFRESH_TOKEN=
```

### 5.2 Fill in Your Values
Replace the placeholders with your actual values from Step 1.2:
- `YOUR_PROJECT_REF` - Found in Supabase Settings > General > Reference ID
- `your_anon_key_here` - Your anon public key
- `your_service_role_key_here` - Your service_role key

**Example:**
```env
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 5.3 Important Notes
- ⚠️ **Never commit `.env.local` to git** (it's already in `.gitignore`)
- 🔒 **Keep service_role key secret** - it has admin access
- ✅ The `NEXT_PUBLIC_` prefix makes variables available in the browser

## Step 6: Install Dependencies & Run

### 6.1 Install Dependencies
```bash
npm install
```

### 6.2 Start Development Server
```bash
npm run dev
```

### 6.3 Access the Dashboard
1. Open browser to [http://localhost:3000](http://localhost:3000)
2. You'll be redirected to login page
3. Login with:
   - **Email**: `proxeadmin@proxe.com`
   - **Password**: `proxepass`
4. Or click **"Continue with Google"** (if configured)

## Step 7: Verify Setup

### 7.1 Check Database Tables
In Supabase SQL Editor, run:
```sql
-- Check tables exist
SELECT table_name 
FROM information_schema.tables 
WHERE table_schema = 'public' 
AND table_name IN ('dashboard_users', 'user_invitations', 'dashboard_settings');
```

### 7.2 Check Admin User
```sql
SELECT id, email, role, is_active 
FROM dashboard_users 
WHERE role = 'admin';
```

### 7.3 Test Login
1. Go to http://localhost:3000/auth/login
2. Login with admin credentials
3. You should see the dashboard

## Troubleshooting

### "Invalid login credentials"
- Verify user exists in Supabase Auth > Users
- Check email/password are correct
- Ensure user is confirmed (Auto Confirm was checked)

### "Supabase client error"
- Check `.env.local` file exists
- Verify environment variables are correct (no extra spaces)
- Restart dev server after adding env vars

### "Can't access dashboard after login"
- Check `dashboard_users` table has your user
- Verify RLS policies are set correctly
- Check browser console for errors

### "Real-time updates not working"
- Verify Realtime is enabled for `chat_sessions` table
- Check Supabase project has Realtime enabled
- Verify you're using the correct Supabase URL

### Database migration errors
- Make sure you're running migrations in order (001, then 002)
- Check if `chat_sessions` table already exists (may need to adjust)
- Verify you have proper permissions

## Next Steps

1. ✅ Test admin login
2. ✅ Invite test users via `/api/auth/invite` endpoint
3. ✅ Configure your integrations (Web Agent, WhatsApp, Voice APIs)
4. ✅ Add sample data to `chat_sessions` to test dashboard
5. ✅ Customize dashboard settings

## Production Deployment

When deploying to production:
1. Update `NEXT_PUBLIC_APP_URL` to your production URL
2. Add production environment variables in your hosting platform
3. Update Google OAuth redirect URIs to include production URL
4. Run database migrations on production Supabase project

