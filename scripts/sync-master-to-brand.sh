#!/bin/bash
# ============================================================
# Sync Master → Brand
# ============================================================
# Usage: ./scripts/sync-master-to-brand.sh [brand]
# Example: ./scripts/sync-master-to-brand.sh windchasers
# Example: ./scripts/sync-master-to-brand.sh proxe
#
# Copies master/agent source code into a brand's agent directory.
# Brand-specific files (.env.local, brand configs, logos) are preserved.
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

BRAND=$1

if [ -z "$BRAND" ]; then
  echo "Usage: ./scripts/sync-master-to-brand.sh [brand]"
  echo "  brand: proxe, windchasers, bcon"
  exit 1
fi

# Validate brand
if [ "$BRAND" != "proxe" ] && [ "$BRAND" != "windchasers" ] && [ "$BRAND" != "bcon" ]; then
  echo "❌ Unknown brand '$BRAND'. Supported: proxe, windchasers, bcon"
  exit 1
fi

MASTER_PATH="master/agent"
BRAND_PATH="brands/$BRAND/agent"

if [ ! -d "$MASTER_PATH" ]; then
  echo "❌ Master path not found: $MASTER_PATH"
  exit 1
fi

if [ ! -d "$BRAND_PATH" ]; then
  echo "❌ Brand path not found: $BRAND_PATH"
  echo "   Create it first or check the brand name."
  exit 1
fi

echo ""
echo "🔄 Syncing Master → $BRAND"
echo "   From: $MASTER_PATH/"
echo "   To:   $BRAND_PATH/"
echo ""

# ── Sync src/ ──
echo "📂 Syncing src/ ..."
rsync -av --delete \
  --exclude='.env.local' \
  --exclude='node_modules' \
  --exclude='.next' \
  --exclude='package-lock.json' \
  --exclude='.sync-backup-*' \
  --exclude='*.log' \
  "$MASTER_PATH/src/" "$BRAND_PATH/src/"

echo ""

# ── Sync public/ (preserve brand assets) ──
if [ -d "$MASTER_PATH/public" ]; then
  echo "📂 Syncing public/ (preserving brand logos/icons) ..."
  rsync -av \
    --exclude='logo.svg' \
    --exclude='logo.png' \
    --exclude='icon.svg' \
    --exclude='icon.png' \
    --exclude='favicon.ico' \
    "$MASTER_PATH/public/" "$BRAND_PATH/public/"
  echo ""
fi

# ── Sync config files ──
echo "📂 Syncing config files ..."
for CONFIG_FILE in next.config.js tailwind.config.ts tsconfig.json postcss.config.js postcss.config.mjs package.json; do
  if [ -f "$MASTER_PATH/$CONFIG_FILE" ]; then
    cp "$MASTER_PATH/$CONFIG_FILE" "$BRAND_PATH/$CONFIG_FILE"
    echo "   ✓ $CONFIG_FILE"
  fi
done
echo ""

# ── Summary ──
echo "✅ Synced Master → $BRAND"
echo ""
echo "⚠️  NOT synced (brand-specific):"
echo "   • .env.local"
echo "   • package-lock.json (run npm install if deps changed)"
echo "   • Brand logos/icons in public/"
echo "   • supabase/migrations/ (in brands/$BRAND/supabase/)"
echo ""
echo "📝 Next steps:"
echo "   1. cd $BRAND_PATH"
echo "   2. npm install  (if deps changed)"
echo "   3. npm run dev  (test it)"
