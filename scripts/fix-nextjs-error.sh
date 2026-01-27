#!/bin/bash
# Fix Next.js webpack module error
# This script cleans build artifacts and prepares for a fresh build

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

cd "$REPO_ROOT"

echo "🔧 Fixing Next.js webpack error..."
echo ""

# 1. Clean all .next directories
echo "1️⃣  Cleaning .next build directories..."
find brand -name ".next" -type d -exec rm -rf {} + 2>/dev/null || true
echo "   ✅ Cleaned .next directories"

# 2. Clean node_modules/.cache if it exists
echo ""
echo "2️⃣  Cleaning Next.js cache..."
find brand -path "*/node_modules/.cache" -type d -exec rm -rf {} + 2>/dev/null || true
echo "   ✅ Cleaned cache directories"

# 3. Remove empty old build directories
echo ""
echo "3️⃣  Removing old build directories..."
if [ -d "brand/proxe/build" ] && [ -z "$(ls -A brand/proxe/build 2>/dev/null)" ]; then
  rmdir brand/proxe/build 2>/dev/null && echo "   ✅ Removed empty brand/proxe/build" || true
fi

# 4. Check for node_modules issues
echo ""
echo "4️⃣  Checking node_modules..."
if [ ! -d "brand/proxe/dashboard/build/node_modules" ] || [ ! -d "brand/windchasers/dashboard/build/node_modules" ]; then
  echo "   ⚠️  Some node_modules directories are missing"
  echo "   Run: cd brand/[brand]/[product]/build && npm install"
fi

echo ""
echo "✅ Cleanup complete!"
echo ""
echo "📝 Next steps:"
echo "   1. Navigate to the project directory:"
echo "      cd brand/[brand]/[product]/build"
echo ""
echo "   2. Reinstall dependencies (if needed):"
echo "      npm install"
echo ""
echo "   3. Start development server:"
echo "      npm run dev"
echo ""
echo "   Or use root scripts:"
echo "      npm run dev:proxe"
echo "      npm run dev:windchasers"
