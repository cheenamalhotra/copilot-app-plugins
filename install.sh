#!/usr/bin/env bash
set -euo pipefail

PLUGIN_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
COPILOT_HOME="${COPILOT_HOME:-$HOME/.copilot}"
MCP_CONFIG="$COPILOT_HOME/mcp-config.json"
SKILLS_DIR="$COPILOT_HOME/skills/worktree-janitor"

command -v node >/dev/null || { echo "node is required"; exit 1; }
command -v sqlite3 >/dev/null || { echo "sqlite3 is required"; exit 1; }

# 1. Skill: copied (not symlinked — Copilot App rejects symlinked skill files).
mkdir -p "$SKILLS_DIR"
cp "$PLUGIN_DIR/skills/worktree-janitor/SKILL.md" "$SKILLS_DIR/SKILL.md"

# 2. MCP server: registered in mcp-config.json (Copilot App's user-level MCP registry).
# Copilot App's "Plugins" marketplace UI is not used here — it requires a signed
# marketplace entry. Registering directly as an MCP server + skill is the supported
# way to add local tools without publishing anywhere.
node - "$MCP_CONFIG" "$PLUGIN_DIR" <<'NODE'
const fs = require('fs');
const [, configPath, pluginDir] = process.argv;

let config = { mcpServers: {} };
if (fs.existsSync(configPath)) {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  config.mcpServers ??= {};
}

config.mcpServers['worktree-janitor'] = {
  tools: ['*'],
  type: 'local',
  command: 'node',
  args: [`${pluginDir}/mcp/server.mjs`],
  workingDirectory: pluginDir,
};

fs.writeFileSync(configPath, JSON.stringify(config, null, 2));
NODE

echo "Registered worktree-janitor MCP server in $MCP_CONFIG"
echo "Linked skill into $SKILLS_DIR"
echo "Restart Copilot App, then ask: \"review my worktrees\""
