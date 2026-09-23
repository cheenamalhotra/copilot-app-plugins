#Requires -Version 5.1
$ErrorActionPreference = "Stop"

$PluginDir = Split-Path -Parent $MyInvocation.MyCommand.Path

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "node is required"
    exit 1
}
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Write-Error "git is required"
    exit 1
}

$nodeMajor = [int]((node -p "process.versions.node.split('.')[0]"))
if ($nodeMajor -lt 22) {
    Write-Warning "Node < 22 detected. Upgrade to Node 22+ for the built-in sqlite module, or install sqlite3.exe on PATH as a fallback."
}

Write-Host @"
worktree-janitor is a real Copilot App plugin (.claude-plugin/ manifest).
Works on macOS, Linux, and Windows.

Install it via the app UI:
  1. Open Copilot App -> Plugins -> Manage marketplaces
  2. Add source: $PluginDir
  3. Install "worktree-janitor" from that marketplace
  4. Restart Copilot App

Then ask: "review my worktrees"
"@
