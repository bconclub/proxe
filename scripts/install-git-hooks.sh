#!/bin/sh
#
# Install the repo's git hooks into the shared .git/hooks dir.
#
# Hooks are NOT version-controlled inside .git, so they're lost on clone and on
# fresh worktrees. Run this once per clone to wire up the cross-brand version
# bump (scripts/git-hooks/pre-commit):
#
#   sh scripts/install-git-hooks.sh
#
# Uses --git-common-dir so the hook applies to the main checkout AND every
# linked worktree (they share one hooks dir).
#
set -e

ROOT="$(git rev-parse --show-toplevel)"
HOOK_DIR="$(git rev-parse --git-common-dir)/hooks"

mkdir -p "$HOOK_DIR"
cp "$ROOT/scripts/git-hooks/pre-commit" "$HOOK_DIR/pre-commit"
chmod +x "$HOOK_DIR/pre-commit"

echo "Installed cross-brand pre-commit hook -> $HOOK_DIR/pre-commit"
