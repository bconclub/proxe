# Nginx Configuration for Web-Agent on pilot.windchasers.in

## Overview
The web-agent should be accessible at `pilot.windchasers.in` (not through `proxe.windchasers.in/widget`).

## Setup Instructions

### Step 1: Create Nginx Configuration

SSH into your VPS and create the Nginx config:

```bash
sudo nano /etc/nginx/sites-available/pilot.windchasers.in
```

### Step 2: Add Server Block

Add this complete server block:

```nginx
# HTTP to HTTPS redirect
server {
    listen 80;
    server_name pilot.windchasers.in;
    
    # Redirect all HTTP to HTTPS
    return 301 https://$server_name$request_uri;
}

# HTTPS server block
server {
    listen 443 ssl http2;
    server_name pilot.windchasers.in;
    
    # SSL certificates (managed by Certbot)
    ssl_certificate /etc/letsencrypt/live/pilot.windchasers.in/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/pilot.windchasers.in/privkey.pem;
    include /etc/letsencrypt/options-ssl-nginx.conf;
    ssl_dhparam /etc/letsencrypt/ssl-dhparams.pem;
    
    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;
    
    # Web-Agent - PROXY TO PORT 3001
    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }
    
    # API routes (for widget functionality)
    location /api/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # CORS headers for API
        add_header Access-Control-Allow-Origin * always;
        add_header Access-Control-Allow-Methods 'GET, POST, OPTIONS' always;
        add_header Access-Control-Allow-Headers 'Content-Type, Authorization' always;
        
        # Handle OPTIONS preflight
        if ($request_method = OPTIONS) {
            return 204;
        }
    }
    
    # Static assets
    location /_next/static/ {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_cache_valid 200 60m;
        add_header Cache-Control "public, max-age=31536000, immutable";
        
        # CORS for static assets
        add_header Access-Control-Allow-Origin * always;
    }
}
```

### Step 3: Enable the Site

```bash
# Create symlink
sudo ln -s /etc/nginx/sites-available/pilot.windchasers.in /etc/nginx/sites-enabled/

# Test configuration
sudo nginx -t

# If test passes, reload Nginx
sudo systemctl reload nginx
```

### Step 4: Set Up SSL Certificate

```bash
# Install Certbot if not already installed
sudo apt-get update
sudo apt-get install certbot python3-certbot-nginx

# Get SSL certificate
sudo certbot --nginx -d pilot.windchasers.in

# Certbot will automatically configure SSL and reload Nginx
```

### Step 5: Verify Deployment

```bash
# Test locally on VPS
curl http://localhost:3001/widget
# Should return HTML

# Test through Nginx (HTTP - should redirect to HTTPS)
curl -I http://pilot.windchasers.in

# Test through Nginx (HTTPS)
curl -I https://pilot.windchasers.in

# Test widget endpoint
curl https://pilot.windchasers.in/widget
```

### Step 6: Update Dashboard Configuration

If the dashboard needs to embed the widget, update the dashboard's environment variable:

```bash
# On VPS, edit dashboard .env.local
cd /var/www/windchasers-proxe
nano .env.local

# Add or update:
NEXT_PUBLIC_WEB_AGENT_URL=https://pilot.windchasers.in

# Restart dashboard
pm2 restart windchasers-dashboard
```

## Verification Checklist

- [ ] Nginx config file created at `/etc/nginx/sites-available/pilot.windchasers.in`
- [ ] Symlink created in `/etc/nginx/sites-enabled/`
- [ ] SSL certificate obtained via Certbot
- [ ] Nginx test passes (`sudo nginx -t`)
- [ ] Nginx reloaded successfully
- [ ] Web-agent running on port 3001 (`pm2 list | grep windchasers-web-agent`)
- [ ] Can access `https://pilot.windchasers.in` in browser
- [ ] Widget loads at `https://pilot.windchasers.in/widget`
- [ ] API routes work at `https://pilot.windchasers.in/api/chat`

## Troubleshooting

### Issue: 502 Bad Gateway
- Check if web-agent is running: `pm2 list | grep windchasers-web-agent`
- Check web-agent logs: `pm2 logs windchasers-web-agent --lines 50`
- Verify port 3001 is listening: `netstat -tlnp | grep :3001`

### Issue: SSL Certificate Error
- Verify certificate exists: `sudo ls -la /etc/letsencrypt/live/pilot.windchasers.in/`
- Renew certificate: `sudo certbot renew`
- Check certificate expiry: `sudo certbot certificates`

### Issue: CORS Errors
- Verify CORS headers are set in Nginx config
- Check middleware is working: `curl -I https://pilot.windchasers.in/api/chat`

### Issue: Widget Not Loading
- Check if widget page exists: `curl https://pilot.windchasers.in/widget`
- Verify PM2 process is running: `pm2 describe windchasers-web-agent`
- Check build exists: `ls -la /var/www/windchasers-web-agent/.next`

## Current Setup Summary

- **Domain:** `pilot.windchasers.in`
- **Web-Agent Port:** `3001`
- **Deployment Directory:** `/var/www/windchasers-web-agent`
- **PM2 Process:** `windchasers-web-agent`
- **Dashboard Domain:** `proxe.windchasers.in` (port 3003)
