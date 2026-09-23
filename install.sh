#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

command -v node >/dev/null || { echo "node is required"; exit 1; }
command -v sqlite3 >/dev/null || { echo "sqlite3 is required"; exit 1; }

cat <<MSG
worktree-janitor is a real Copilot App plugin (.claude-plugin/ manifest).

Install it via the app UI:
  1. Open Copilot App -> Plugins -> Manage marketplaces
  2. Add source: $PLUGIN_DIR
  3. Install "worktree-janitor" from that marketplace
  4. Restart Copilot App

Then ask: "review my worktrees"
MSG
