# Meta Template Sync Worker

Background worker that polls Meta Business API every 6 hours to sync WhatsApp template approval status to Supabase.

## What It Does

1. Fetches all message templates from Meta WABA via Graph API
2. Matches templates by name against `follow_up_templates.meta_template_name`
3. Updates `meta_status` field when status changes (APPROVED → approved, PENDING → pending, etc.)
4. Logs all activity to console and `logs/` directory

## Installation

```bash
cd workers/template-sync
npm install
```

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
META_ACCESS_TOKEN=your_meta_access_token
META_WABA_ID=your_waba_id
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

## Running

### Development (one-time run)
```bash
npm run sync
```

### Production (with PM2)
```bash
# Add to ecosystem.config.js in project root
pm2 start ecosystem.config.js --only bcon-template-sync
```

Or use PM2 directly:
```bash
pm2 start index.ts --name bcon-template-sync --cron "0 */6 * * *" --no-autorestart
```

## PM2 Ecosystem Config

Add to `ecosystem.config.js` in the project root:

```javascript
module.exports = {
  apps: [
    {
      name: 'bcon-template-sync',
      script: './workers/template-sync/index.ts',
      interpreter: 'ts-node',
      cron_restart: '0 */6 * * *', // Every 6 hours
      autorestart: false,
      env_file: '.env',
      env: { NODE_ENV: 'production' }
    }
  ]
};
```

## Status Mapping

| Meta Status | DB Status |
|-------------|-----------|
| APPROVED | approved |
| PENDING | pending |
| REJECTED | rejected |
| PAUSED | rejected |
| PENDING_DELETION | rejected |
| DELETED | rejected |
| DISABLED | rejected |
| IN_APPEAL | pending |

## Rate Limiting

- Respects Meta's 60 calls/minute limit per WABA
- 1 second delay between update operations
- 1 retry on failure with exponential backoff

## Logs

Logs are written to:
- Console (stdout)
- `logs/sync-YYYY-MM-DD.log` (rotated daily)

## Exit Codes

- `0`: Success
- `1`: Error (check logs)
