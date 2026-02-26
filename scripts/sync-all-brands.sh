#!/bin/bash
# ============================================================
# Sync Master → ALL Brands
# ============================================================
# Usage: ./scripts/sync-all-brands.sh
#
# Pushes master/agent to every brand's agent directory.
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$REPO_ROOT"

echo ""
echo "🔄 Syncing Master → All Brands"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

SYNCED=0
SKIPPED=0

for BRAND in proxe windchasers bcon; do
  if [ -d "brands/$BRAND/agent" ]; then
    echo "────────────────────────────────────────"
    echo "  Brand: $BRAND"
    echo "────────────────────────────────────────"
    "$SCRIPT_DIR/sync-master-to-brand.sh" "$BRAND"
    SYNCED=$((SYNCED + 1))
    echo ""
  else
    echo "⏭️  Skipping $BRAND (directory not found)"
    SKIPPED=$((SKIPPED + 1))
    echo ""
  fi
done

echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Done! Synced $SYNCED brand(s), skipped $SKIPPED"
echo ""
echo "📝 Next: test each brand build:"
for BRAND in proxe windchasers bcon; do
  if [ -d "brands/$BRAND/agent" ]; then
    echo "   cd $BRAND/agent && npm install && npm run build"
  fi
done
