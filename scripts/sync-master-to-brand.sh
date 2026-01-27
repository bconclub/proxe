#!/bin/bash
# Sync master template to brand builds
# Usage: ./scripts/sync-master-to-brand.sh [brand] [product]
# Example: ./scripts/sync-master-to-brand.sh proxe dashboard

set -e

BRAND=$1        # proxe or windchasers
PRODUCT=$2      # dashboard, web-agent, or whatsapp

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

if [ -z "$BRAND" ] || [ -z "$PRODUCT" ]; then
  echo "❌ Error: Brand and product name required"
  echo "Usage: $0 [brand] [product]"
  echo "  brand:  proxe or windchasers"
  echo "  product: dashboard, web-agent, or whatsapp"
  exit 1
fi

# Validate brand
if [ "$BRAND" != "proxe" ] && [ "$BRAND" != "windchasers" ]; then
  echo "❌ Error: Unknown brand '$BRAND'"
  echo "Supported brands: proxe, windchasers"
  exit 1
fi

# Validate product
if [ "$PRODUCT" != "dashboard" ] && [ "$PRODUCT" != "web-agent" ] && [ "$PRODUCT" != "whatsapp" ]; then
  echo "❌ Error: Unknown product '$PRODUCT'"
  echo "Supported products: dashboard, web-agent, whatsapp"
  exit 1
fi

MASTER_DIR="brand/master/${PRODUCT}/build"
BRAND_DIR="brand/${BRAND}/${PRODUCT}/build"

# Check if master directory exists
if [ ! -d "$MASTER_DIR" ]; then
  echo "❌ Error: Master template not found at $MASTER_DIR"
  echo "Please create the master template first"
  exit 1
fi

# Check if brand directory exists
if [ ! -d "$BRAND_DIR" ]; then
  echo "⚠️  Warning: Brand directory not found at $BRAND_DIR"
  echo "Creating directory..."
  mkdir -p "$BRAND_DIR"
fi

echo "🔄 Syncing master template to $BRAND/$PRODUCT..."
echo "   Master: $MASTER_DIR"
echo "   Brand:  $BRAND_DIR"

# Create backup
BACKUP_DIR="${BRAND_DIR}/.sync-backup-$(date +%Y%m%d-%H%M%S)"
echo "📦 Creating backup at $BACKUP_DIR"
mkdir -p "$BACKUP_DIR"
if [ -d "${BRAND_DIR}/src" ]; then
  cp -r "${BRAND_DIR}/src" "$BACKUP_DIR/src" 2>/dev/null || true
fi
if [ -f "${BRAND_DIR}/package.json" ]; then
  cp "${BRAND_DIR}/package.json" "$BACKUP_DIR/" 2>/dev/null || true
fi

# Sync files from master, excluding brand-specific directories and files
echo "📂 Syncing files from master..."
rsync -av --delete \
  --exclude='config/' \
  --exclude='docs/' \
  --exclude='supabase/' \
  --exclude='.env.local' \
  --exclude='node_modules/' \
  --exclude='.next/' \
  --exclude='.git/' \
  --exclude='*.log' \
  --exclude='.sync-backup-*/' \
  "${MASTER_DIR}/" "${BRAND_DIR}/"

echo "✅ Sync complete!"
echo "   Backup saved at: $BACKUP_DIR"
echo ""
echo "📝 Next steps:"
echo "   1. Review changes: git diff ${BRAND_DIR}"
echo "   2. Apply brand-specific config from ${BRAND_DIR}/config/"
echo "   3. Test build: cd ${BRAND_DIR} && npm install && npm run build"
echo "   4. If issues, restore: cp -r $BACKUP_DIR/* ${BRAND_DIR}/"
