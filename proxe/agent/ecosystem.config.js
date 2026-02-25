/**
 * PM2 Ecosystem Configuration for PROXe
 * 
 * Manages both Dashboard and Web-Agent processes together
 * 
 * Usage:
 *   pm2 start ecosystem.config.js    # Start both apps
 *   pm2 restart ecosystem.config.js   # Restart both apps
 *   pm2 stop ecosystem.config.js      # Stop both apps
 *   pm2 delete ecosystem.config.js    # Remove both apps
 *   pm2 logs                          # View logs from both
 *   pm2 logs proxe-dashboard          # View dashboard logs only
 *   pm2 logs proxe-web-agent           # View web-agent logs only
 */

module.exports = {
  apps: [
    {
      name: 'proxe-dashboard',
      cwd: '/var/www/proxe-dashboard',
      script: 'npm',
      args: 'start',
      env: {
        PORT: 4000,
        NODE_ENV: 'production'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: '/var/www/proxe-dashboard/logs/pm2-error.log',
      out_file: '/var/www/proxe-dashboard/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    },
    {
      name: 'proxe-web-agent',
      cwd: '/var/www/proxe-web-agent',
      script: 'npm',
      args: 'start',
      env: {
        PORT: 3001,
        NODE_ENV: 'production'
      },
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '1G',
      error_file: '/var/www/proxe-web-agent/logs/pm2-error.log',
      out_file: '/var/www/proxe-web-agent/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
}
