# GitHub Actions Workflow Location

## Important Note

GitHub Actions workflows **must** be located at the repository root in:
```
.github/workflows/deploy-windchasers-dashboard.yml
```

This is a GitHub requirement - workflows cannot run from subdirectories.

## Current Location

The workflow file is at:
```
Command Center/.github/workflows/deploy-windchasers-dashboard.yml
```

## Workflow Configuration

Even though the workflow file is at the root, it is configured to:
- ✅ Only trigger on changes to `brand/windchasers/build/**`
- ✅ Deploy from `brand/windchasers/build/` source
- ✅ Target `/var/www/windchasers-proxe/` on VPS
- ✅ Use PM2 name: `windchasers-proxe`
- ✅ Run on port: `3003`

## Why Root Location?

GitHub Actions only recognizes workflows in:
- `.github/workflows/` at repository root
- Cannot be in subdirectories like `brand/windchasers/.github/workflows/`

The workflow is brand-specific through:
1. Path filters (`paths: ['brand/windchasers/build/**']`)
2. Source path in rsync (`brand/windchasers/build/`)
3. PM2 process name (`windchasers-proxe`)
