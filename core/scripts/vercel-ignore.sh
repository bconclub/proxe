#!/usr/bin/env bash
# Vercel "Ignored Build Step" — per-brand scoping for the one-core monorepo.
# All 5 brand projects run this same file (via core/vercel.json); each self-scopes
# off its own BRAND_ID/NEXT_PUBLIC_BRAND. Vercel convention: exit 1 = BUILD, 0 = SKIP.
#
# A push builds a brand only if that brand is in the "affected" set computed across
# every commit since this brand last deployed (VERCEL_GIT_PREVIOUS_SHA .. HEAD):
#
#   - a commit touched brands/<brand>/                    -> that brand
#   - a commit touched core/ AND its conventional-commit
#     scope names ONE brand  (fix(lokazen): , feat(pop-voice): )  -> that brand
#   - a commit touched core/ with a GENERIC/unknown scope
#     (fix:, fix(dashboard):, fix(widget):, chore(ci):, …) -> ALL brands (shared)
#
# So `feat(pop): …core…` + `fix(lokazen): …brands/lokazen…` in one push builds
# ONLY pop + lokazen; the other three skip.
#
# Trade-off (accepted, founder decision): a brand-scoped commit that ALSO changes
# shared behaviour will NOT rebuild the other brands, so they can lag on old code
# until their next build. This trusts the fix(<brand>): scope to reflect blast
# radius. Anything unattributable, or any generic/shared scope, still builds all.
#
# Safety: no brand env, no previous-SHA, or an un-walkable commit range all fall
# back to BUILD (or a path-only check) — a redundant build is cheap, a brand stuck
# on stale code is not.
set -u
log() { echo "[vercel-ignore] $*"; }

BRAND="${BRAND_ID:-${NEXT_PUBLIC_BRAND:-}}"
if [ -z "$BRAND" ]; then log "no BRAND_ID/NEXT_PUBLIC_BRAND -> BUILD"; exit 1; fi

ALL_BRANDS="bcon pop proxe windchasers lokazen"

# Conventional-commit scope -> brand id (empty = not a brand scope / generic).
scope_to_brand() {
  case "$1" in
    lokazen)                 echo lokazen ;;
    bcon)                    echo bcon ;;
    proxe)                   echo proxe ;;
    windchasers|windchaser)  echo windchasers ;;
    pop|pop-voice)           echo pop ;;
    *)                       echo "" ;;
  esac
}

# Diff base = this brand's last-deployed commit (spans every commit in the push).
# Must be present and valid; otherwise we can't reason about the range -> BUILD.
BASE="${VERCEL_GIT_PREVIOUS_SHA:-}"
if [ -z "$BASE" ] || ! git cat-file -e "${BASE}^{commit}" 2>/dev/null; then
  log "no usable VERCEL_GIT_PREVIOUS_SHA -> BUILD (safe default)"; exit 1
fi

# Vercel clones shallow; deepen so we can walk BASE..HEAD. Best-effort.
git fetch --deepen=200 --quiet 2>/dev/null || git fetch --unshallow --quiet 2>/dev/null || true

COMMITS="$(git rev-list "$BASE..HEAD" 2>/dev/null || true)"
if [ -z "$COMMITS" ]; then
  # Can't enumerate the range (shallow / rebase / force-push). Degrade to the
  # SAFE path-only rule using just the two endpoints (shallow-safe).
  if git diff --quiet "$BASE" HEAD -- ":/core" ":/brands/$BRAND"; then
    log "range unwalkable; no core/ or brands/$BRAND change on endpoints -> SKIP"; exit 0
  else
    log "range unwalkable; core/ or brands/$BRAND changed on endpoints -> BUILD"; exit 1
  fi
fi

affected=""
add() { case " $affected " in *" $1 "*) : ;; *) affected="$affected $1" ;; esac; }
add_all() { for b in $ALL_BRANDS; do add "$b"; done; }

for sha in $COMMITS; do
  files="$(git show --name-only --format="" "$sha" 2>/dev/null || true)"
  if [ -z "$files" ]; then add_all; continue; fi   # can't read commit -> be safe

  # 1) brand-folder touches
  for b in $ALL_BRANDS; do
    echo "$files" | grep -q "^brands/$b/" && add "$b"
  done

  # 2) core touches -> scope-attributed brand, else ALL
  if echo "$files" | grep -q "^core/"; then
    subj="$(git show -s --format=%s "$sha" 2>/dev/null || true)"
    scope="$(printf '%s' "$subj" | sed -n 's/^[a-zA-Z][a-zA-Z]*(\([^)]*\)):.*/\1/p')"
    b="$(scope_to_brand "$scope")"
    if [ -n "$b" ]; then add "$b"; else add_all; fi
  fi
done

case " $affected " in
  *" $BRAND "*) log "affected:${affected:-none} | $BRAND -> BUILD"; exit 1 ;;
  *)           log "affected:${affected:-none} | $BRAND not affected -> SKIP"; exit 0 ;;
esac
