#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v node >/dev/null || { echo "node is required"; exit 1; }
command -v git >/dev/null || { echo "git is required"; exit 1; }

NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 22 ]; then
  command -v sqlite3 >/dev/null || {
    echo "Node < 22 detected; either upgrade to Node 22+ (uses the built-in sqlite module)"
    echo "or install the sqlite3 CLI as a fallback."
    exit 1
  }
fi

cat <<MSG
worktree-janitor is a real Copilot App plugin (.claude-plugin/ manifest).
Works on macOS, Linux, and Windows.

Install it via the app UI:
  1. Open Copilot App -> Plugins -> Manage marketplaces
  2. Add source: $PLUGIN_DIR
  3. Install "cm-worktree-janitor" from that marketplace
  4. Restart Copilot App

Then ask: "review my worktrees"
MSG
