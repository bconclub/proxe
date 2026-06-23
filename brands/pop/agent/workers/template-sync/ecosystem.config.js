/**
 * PM2 Ecosystem Config for Template Sync Worker
 * 
 * This worker polls Meta Business API every 6 hours to sync template approval status.
 * 
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 save
 * 
 * Or add to the main voice ecosystem.config.js in brands/bcon/voice/
 */

module.exports = {
  apps: [
    {
      name: 'bcon-template-sync',
      script: './index.ts',
      cwd: __dirname,
      interpreter: 'ts-node',
      cron_restart: '0 */6 * * *', // Every 6 hours at minute 0
      autorestart: false, // Don't restart on crash - wait for next cron
      env_file: '../../.env', // Load from agent root .env
      env: { 
        NODE_ENV: 'production',
      },
      // Logs
      log_file: './logs/combined.log',
      out_file: './logs/out.log',
      error_file: './logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // Resource limits
      max_memory_restart: '512M',
      // Don't run multiple instances
      instances: 1,
      exec_mode: 'fork',
    }
  ]
};
