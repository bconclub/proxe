#!/usr/bin/env bash
# Vercel "Ignored Build Step" for the one-core monorepo (all 5 brand projects
# use this same file via core/vercel.json; each self-scopes off its own
# BRAND_ID/NEXT_PUBLIC_BRAND env var).
#
# Vercel convention: exit 1 = BUILD, exit 0 = SKIP.
#
# Rule (path-based / "safe"): rebuild THIS brand only if the push touched
#   - shared code under core/   (changes every brand's bundle -> all rebuild), OR
#   - this brand's own brands/<id>/ folder.
# A push that only edits a DIFFERENT brand's folder is skipped here.
#
# When in doubt (no brand env, no reliable diff base) we BUILD, never skip —
# a redundant build is cheap; a brand silently stuck on old code is not.
set -u

BRAND="${BRAND_ID:-${NEXT_PUBLIC_BRAND:-}}"
if [ -z "$BRAND" ]; then
  echo "[vercel-ignore] no BRAND_ID/NEXT_PUBLIC_BRAND -> BUILD (safe default)"
  exit 1
fi

# Prefer Vercel's last-deployed SHA (captures ALL commits in this push, not just
# the tip). Fall back to the commit's parent. If neither is usable, build.
BASE=""
if [ -n "${VERCEL_GIT_PREVIOUS_SHA:-}" ] && git cat-file -e "${VERCEL_GIT_PREVIOUS_SHA}^{commit}" 2>/dev/null; then
  BASE="$VERCEL_GIT_PREVIOUS_SHA"
elif git rev-parse --verify HEAD^ >/dev/null 2>&1; then
  BASE="HEAD^"
else
  echo "[vercel-ignore] no usable diff base -> BUILD (safe default)"
  exit 1
fi

# ':/path' anchors the pathspec to the repo root regardless of cwd (Vercel runs
# this from the project Root Directory, i.e. core/).
if git diff --quiet "$BASE" HEAD -- ":/core" ":/brands/$BRAND"; then
  echo "[vercel-ignore] no changes in core/ or brands/$BRAND since $BASE -> SKIP"
  exit 0
else
  echo "[vercel-ignore] core/ or brands/$BRAND changed since $BASE -> BUILD"
  exit 1
fi
