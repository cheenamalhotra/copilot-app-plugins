# Worktree Janitor

A Copilot App plugin that finds obsolete git worktrees left behind by Copilot App sessions,
scans on a schedule, and deletes only the ones you select and confirm.

Copilot App creates a worktree per session under `~/Code/copilot-worktrees/<repo>/<branch-name>`.
They are never cleaned up automatically, so they accumulate — often tens of gigabytes.

## Install

```bash
./install.sh
```

This symlinks the plugin into `~/.copilot/installed-plugins/_direct/worktree-janitor`.
Restart Copilot App to pick up the MCP server and skill.

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

`schedule install` writes a launchd agent at
`~/Library/LaunchAgents/com.github.copilot.worktree-janitor.plist` that runs a scan on an
interval and posts a macOS notification when candidates are found. The result lands in
`last-report.json`, which Copilot reads instantly via `get_last_report`.

## Files

```
plugin.json                    plugin manifest
.mcp.json                      MCP server registration
mcp/server.mjs                 MCP stdio server (9 tools, zero dependencies)
bin/janitor.mjs                CLI entry point, also used by the scheduler
lib/scan.mjs                   discovery + classification
lib/actions.mjs                delete / keep, with salvage
lib/appdb.mjs                  read-only snapshot of the Copilot App database
lib/git.mjs                    async git helpers
lib/schedule.mjs               launchd agent management
skills/worktree-janitor/       skill that drives the review-and-confirm flow
```

State lives in `~/.copilot/plugin-data/_direct/worktree-janitor/`:
`config.json`, `last-report.json`, `history.jsonl`, `salvage/`.

## Requirements

macOS, Node 18+, `git`, `sqlite3`. All shipped with the system or already required by Copilot App.
