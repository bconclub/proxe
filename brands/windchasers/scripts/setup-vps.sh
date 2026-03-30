#!/bin/bash
# =============================================================================
# Windchasers VPS First-Time Setup
# Run this once on a fresh VPS before the first GitHub Actions deploy
#
# Usage:
#   chmod +x setup-vps.sh
#   sudo ./setup-vps.sh
# =============================================================================

set -e

DOMAIN="proxe.windchasers.in"
APP_DIR="/var/www/windchasers-proxe"
NGINX_CONF="proxe-windchasers.conf"

echo "========================================="
echo "  Windchasers VPS Setup — $DOMAIN"
echo "========================================="

# ── 1. System packages ────────────────────────────────────────────────────────
echo ""
echo "📦 Installing system packages..."
apt-get update -qq
apt-get install -y curl git nginx certbot python3-certbot-nginx

# ── 2. Node.js 18 (via nvm) ───────────────────────────────────────────────────
echo ""
echo "📦 Installing Node.js 18..."
if ! command -v node &>/dev/null || [[ "$(node -v)" != v18* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_18.x | bash -
  apt-get install -y nodejs
fi
echo "✅ Node $(node -v) / npm $(npm -v)"

# ── 3. PM2 ────────────────────────────────────────────────────────────────────
echo ""
echo "📦 Installing PM2..."
npm install -g pm2
pm2 startup systemd -u $SUDO_USER --hp /home/$SUDO_USER || true
echo "✅ PM2 $(pm2 -v)"

# ── 4. App directory ──────────────────────────────────────────────────────────
echo ""
echo "📁 Creating app directory: $APP_DIR"
mkdir -p $APP_DIR
mkdir -p $APP_DIR/logs
chown -R ${SUDO_USER:-$USER}:${SUDO_USER:-$USER} $APP_DIR

# ── 5. .env.local ─────────────────────────────────────────────────────────────
ENV_FILE="$APP_DIR/.env.local"

if [ -f "$ENV_FILE" ]; then
  echo ""
  echo "⚠️  .env.local already exists — skipping (won't overwrite)"
else
  echo ""
  echo "📝 Creating .env.local template at $ENV_FILE"
  cat > "$ENV_FILE" << 'EOF'
# ── Supabase ──────────────────────────────────────────────────────────────────
NEXT_PUBLIC_WINDCHASERS_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
NEXT_PUBLIC_WINDCHASERS_SUPABASE_ANON_KEY=YOUR_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY

# ── Claude AI ─────────────────────────────────────────────────────────────────
CLAUDE_API_KEY=sk-ant-api03-YOUR_KEY

# ── WhatsApp — Meta Cloud API ─────────────────────────────────────────────────
META_WHATSAPP_ACCESS_TOKEN=YOUR_ACCESS_TOKEN
META_WHATSAPP_PHONE_NUMBER_ID=YOUR_PHONE_NUMBER_ID
META_WHATSAPP_WABA_ID=YOUR_WABA_ID
META_WHATSAPP_VERIFY_TOKEN=windchasers-proxe-verify

# ── Shared API key (used by landing pages integration) ────────────────────────
WHATSAPP_API_KEY=YOUR_SHARED_API_KEY

# ── Brand & App ───────────────────────────────────────────────────────────────
NEXT_PUBLIC_BRAND=windchasers
NEXT_PUBLIC_APP_URL=https://proxe.windchasers.in

# ── Google Calendar (optional) ────────────────────────────────────────────────
# GOOGLE_CALENDAR_ID=your-calendar@gmail.com
# GOOGLE_CALENDAR_TIMEZONE=Asia/Kolkata
# GOOGLE_SERVICE_ACCOUNT_EMAIL=service@project.iam.gserviceaccount.com
# GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"

# ── Runtime ───────────────────────────────────────────────────────────────────
PORT=3003
NODE_ENV=production
NEXT_TELEMETRY_DISABLED=1
EOF

  echo ""
  echo "⚠️  IMPORTANT: Fill in the values in $ENV_FILE before running deploy!"
  echo "   nano $ENV_FILE"
fi

# ── 6. Nginx ──────────────────────────────────────────────────────────────────
echo ""
echo "🌐 Setting up Nginx..."

NGINX_SRC="$(dirname $0)/../nginx/proxe-unified.conf"
NGINX_DEST="/etc/nginx/sites-available/$NGINX_CONF"

if [ -f "$NGINX_SRC" ]; then
  cp "$NGINX_SRC" "$NGINX_DEST"
  echo "✅ Copied nginx config from repo"
else
  echo "⚠️  Nginx config not found at $NGINX_SRC — creating minimal config"
  cat > "$NGINX_DEST" << NGINX
server {
    listen 80;
    server_name $DOMAIN;

    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;

    location ~ ^/api/(agent/web/chat|chat)$ {
        proxy_pass http://127.0.0.1:3003;
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location / {
        proxy_pass http://127.0.0.1:3003;
    }

    location /_next/static {
        proxy_pass http://127.0.0.1:3003;
        add_header Cache-Control "public, max-age=31536000, immutable";
    }

    location = /api/health {
        proxy_pass http://127.0.0.1:3003;
        access_log off;
    }
}
NGINX
fi

# Enable site
ln -sf "$NGINX_DEST" /etc/nginx/sites-enabled/$NGINX_CONF
rm -f /etc/nginx/sites-enabled/default 2>/dev/null || true

nginx -t && systemctl reload nginx
echo "✅ Nginx configured for $DOMAIN"

# ── 7. SSL ────────────────────────────────────────────────────────────────────
echo ""
read -p "🔒 Set up SSL with Let's Encrypt now? (y/N) " setup_ssl
if [[ "$setup_ssl" =~ ^[Yy]$ ]]; then
  read -p "   Enter your email for Let's Encrypt: " le_email
  certbot --nginx -d $DOMAIN --non-interactive --agree-tos -m "$le_email"
  echo "✅ SSL certificate installed"
else
  echo "⚠️  Skipping SSL — run manually later:"
  echo "   certbot --nginx -d $DOMAIN"
fi

# ── 8. SSH key for GitHub Actions ─────────────────────────────────────────────
echo ""
echo "🔑 GitHub Actions SSH Setup"
echo "   Generate a deploy key on your LOCAL machine:"
echo ""
echo "   ssh-keygen -t ed25519 -C 'github-actions-windchasers' -f ~/.ssh/windchasers_deploy"
echo ""
echo "   Then:"
echo "   1. Add PUBLIC key to this VPS:  ~/.ssh/authorized_keys"
echo "   2. Add PRIVATE key to GitHub:   Settings > Secrets > WINDCHASERS_VPS_SSH_KEY"
echo "   3. Add these GitHub secrets:"
echo "      WINDCHASERS_VPS_HOST = $(curl -s ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
echo "      WINDCHASERS_VPS_USER = $(whoami)"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo "========================================="
echo "  ✅ VPS setup complete!"
echo "========================================="
echo ""
echo "Next steps:"
echo "  1. Fill in .env.local:  nano $ENV_FILE"
echo "  2. Add SSH deploy key to GitHub secrets"
echo "  3. Push to origin/main to trigger first deploy"
echo ""
echo "Webhook URL for Meta Developer Console:"
echo "  https://$DOMAIN/api/agent/whatsapp/meta"
echo ""
echo "Landing pages API:"
echo "  POST https://$DOMAIN/api/integrations/landing-pages"
echo "  Header: x-api-key: <your WHATSAPP_API_KEY>"
