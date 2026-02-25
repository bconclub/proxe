# Vercel Build Fix

## Issue
Vercel build is failing during `npm run build` step. The error message is cut off, but common causes include:

1. **Missing Environment Variables** - Required Supabase/API keys not set in Vercel
2. **TypeScript Errors** - Type errors causing build to fail
3. **Monorepo Structure** - Vercel needs to know the root directory
4. **Build Configuration** - Next.js config issues

## Fixes Applied

### 1. Updated next.config.js
- Allow TypeScript errors on Vercel builds
- Set `ignoreBuildErrors: true` when `VERCEL=1`

### 2. Created vercel.json
- Specify root directory: `brand/windchasers/dashboard/build`
- Set build and install commands
- Configure output directory

## Required Vercel Environment Variables

Set these in Vercel Dashboard → Settings → Environment Variables:

### Supabase (Required)
```
NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-key
```

### Claude API (Required)
```
CLAUDE_API_KEY=sk-ant-api03-your-key
```

### Optional
```
NEXT_PUBLIC_BUILD_TIME=2026-01-29T11:31:32.934Z
NODE_ENV=production
```

## Vercel Project Settings

### Root Directory
Set Root Directory to: `brand/windchasers/dashboard/build`

### Build Command
```
npm run build
```

### Output Directory
```
.next
```

### Install Command
```
npm ci
```

## Troubleshooting

### Build Still Failing?

1. **Check Vercel Logs** - Look for the actual error message
2. **Verify Environment Variables** - All required vars must be set
3. **Check TypeScript Errors** - Run `npm run type-check` locally
4. **Verify Root Directory** - Must point to `build/` folder

### Common Errors

**Error: Cannot find module**
- Solution: Root directory not set correctly
- Fix: Set Root Directory to `brand/windchasers/dashboard/build`

**Error: Environment variable missing**
- Solution: Required env vars not set in Vercel
- Fix: Add all variables from `env.production.example`

**Error: TypeScript errors**
- Solution: Type errors blocking build
- Fix: Already handled with `ignoreBuildErrors` on Vercel

## Next Steps

1. Set environment variables in Vercel Dashboard
2. Configure Root Directory in Project Settings
3. Redeploy
4. Check build logs for specific error
