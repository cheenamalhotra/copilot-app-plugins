# Worktree Janitor

A Copilot App plugin that finds obsolete git worktrees left behind by Copilot App sessions,
scans on a schedule, and deletes only the ones you select and confirm.

Copilot App creates a worktree per session under `~/Code/copilot-worktrees/<repo>/<branch-name>`.
They are never cleaned up automatically, so they accumulate — often tens of gigabytes.

## Install

Works on macOS, Linux, and Windows.

```bash
./install.sh          # macOS / Linux
```
```powershell
.\install.ps1          # Windows
```

Both scripts just check prerequisites and print the steps: open Copilot App ->
Plugins -> Manage marketplaces -> Add source -> this folder's path -> install
"worktree-janitor" -> restart Copilot App.

## Use

Ask Copilot in any session:

- "review my worktrees"
- "clean up obsolete copilot worktrees"
- "schedule a weekly worktree scan"

Copilot scans, shows you a grouped table, and waits for you to pick. Nothing is deleted
without an explicit confirmation of an explicit list.

## How a worktree is classified

| Status | Meaning |
| --- | --- |
| `obsolete` | Matched a cleanup rule and holds no unsaved work. Safe to delete. |
| `review` | Matched a rule but has uncommitted or unpushed work. Needs a deliberate decision. |
| `active` | Running session, locked worktree, or recent activity. Left alone. |
| `keep` | You pinned it. Never suggested again. |

Detection rules (all toggleable):

- `missingDirectory` — git still registers a worktree whose directory is gone.
- `orphanNotTracked` — directory exists but the Copilot App database does not know it.
- `workspaceArchived` — the owning session was archived.
- `noWorkspace` — the worktree row has no session referencing it.
- `pullRequestMerged` — the associated PR is merged.
- `stale` — no activity for `staleDays` (default 14).

Activity is the newest of: last commit, directory mtime, workspace update, session update.

## Safety

- Reads the app database from a temporary snapshot copy, never the live file.
- Worktrees with uncommitted or unpushed work are **skipped** unless you force them.
- Before any forced deletion, uncommitted changes are written as a patch to
  `~/.copilot/plugin-data/_direct/worktree-janitor/salvage/`.
- Deletions go through `git worktree remove` + `git worktree prune` so git metadata stays consistent.
- Branches are kept by default; they are only deleted when merged into base and you opt in.
- Every deletion is appended to `history.jsonl`.
- Scheduled runs only scan and notify. They never delete.

## CLI

The same engine works standalone:

```bash
node bin/janitor.mjs scan                          # classify everything
node bin/janitor.mjs scan --json --stale-days=30
node bin/janitor.mjs delete <path>                 # dry run by default
node bin/janitor.mjs delete <path> --yes
node bin/janitor.mjs delete --all-obsolete --yes
node bin/janitor.mjs keep <path>
node bin/janitor.mjs config
node bin/janitor.mjs config set '{"staleDays":30}'
node bin/janitor.mjs schedule install --interval-hours=24
node bin/janitor.mjs schedule status
node bin/janitor.mjs schedule uninstall
```

## Schedule

`schedule install` registers a scheduled scan on an interval and posts a notification when
candidates are found. The result lands in `last-report.json`, which Copilot reads instantly
via `get_last_report`. Backend is picked automatically per OS:

| OS | Mechanism | Notification |
| --- | --- | --- |
| macOS | launchd agent (`~/Library/LaunchAgents/…plist`) | `osascript` banner |
| Linux | systemd `--user` timer, falls back to crontab | `notify-send` (if present) |
| Windows | Scheduled Task (`schtasks`) | PowerShell balloon tip |

## Files

```
.claude-plugin/plugin.json     plugin manifest
.claude-plugin/marketplace.json local marketplace listing (for "Add source")
.mcp.json                      MCP server registration
mcp/server.mjs                 MCP stdio server (9 tools, zero dependencies)
bin/janitor.mjs                CLI entry point, also used by the scheduler
lib/scan.mjs                   discovery + classification
lib/actions.mjs                delete / keep, with salvage
lib/appdb.mjs                  read-only snapshot of the Copilot App database (node:sqlite)
lib/git.mjs                    async git helpers
lib/schedule.mjs               per-OS scheduler (launchd / systemd+cron / schtasks)
skills/worktree-janitor/       skill that drives the review-and-confirm flow
```

State lives in `~/.copilot/plugin-data/_direct/worktree-janitor/`:
`config.json`, `last-report.json`, `history.jsonl`, `salvage/`.

## Requirements

- Node 18+ (Node 22+ preferred — uses the built-in `node:sqlite` module; on
  older Node it falls back to the `sqlite3` CLI, so install that instead)
- `git` on PATH
- macOS, Linux, or Windows
