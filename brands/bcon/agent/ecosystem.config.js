/**
 * PM2 Ecosystem Configuration — BCON
 *
 * Usage:
 *   pm2 start ecosystem.config.js
 *   pm2 restart ecosystem.config.js
 *   pm2 stop ecosystem.config.js
 *   pm2 logs bcon-dashboard
 */

module.exports = {
  apps: [
    {
      name: 'bcon-dashboard',
      cwd: '/var/www/bcon-proxe',
      script: 'npm',
      args: 'start',
      env: {
        PORT: 3005,
        NODE_ENV: 'production'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: '/var/www/bcon-proxe/logs/pm2-error.log',
      out_file: '/var/www/bcon-proxe/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
}
