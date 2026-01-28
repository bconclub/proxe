/**
 * PM2 Ecosystem Configuration for Windchasers Web-Agent
 * 
 * Manages the web-agent process for Windchasers
 * 
 * Usage:
 *   pm2 start ecosystem.config.js    # Start web-agent
 *   pm2 restart ecosystem.config.js   # Restart web-agent
 *   pm2 stop ecosystem.config.js      # Stop web-agent
 *   pm2 delete ecosystem.config.js    # Remove web-agent
 *   pm2 logs windchasers-web-agent    # View logs
 */

module.exports = {
  apps: [
    {
      name: 'windchasers-web-agent',
      cwd: '/var/www/windchasers-web-agent',
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
      error_file: '/var/www/windchasers-web-agent/logs/pm2-error.log',
      out_file: '/var/www/windchasers-web-agent/logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s'
    }
  ]
}
