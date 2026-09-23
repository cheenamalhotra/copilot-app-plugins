#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
TARGET_ROOT="${COPILOT_HOME:-$HOME/.copilot}/installed-plugins/_direct"
TARGET="$TARGET_ROOT/worktree-janitor"

command -v node >/dev/null || { echo "node is required"; exit 1; }
command -v sqlite3 >/dev/null || { echo "sqlite3 is required"; exit 1; }

mkdir -p "$TARGET_ROOT"
rm -rf "$TARGET"
ln -s "$PLUGIN_DIR" "$TARGET"

echo "Installed worktree-janitor -> $TARGET"
echo "Restart Copilot App, then ask: \"review my worktrees\""
