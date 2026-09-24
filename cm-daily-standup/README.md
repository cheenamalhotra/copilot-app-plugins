# Daily Standup

A Copilot App plugin that generates a standup summary from what you actually did:
git commits, GitHub PRs/issues, and Copilot App sessions — grouped by repo.

No extra accounts, tokens, or setup: it discovers repos from your Copilot App
projects, uses the `gh` CLI you're likely already authenticated with, and reads
the Copilot App's local database read-only.

## Install

Part of the `cm-copilot-plugins` marketplace. In Copilot App: Plugins -> Manage
marketplaces -> add this repo (or its local path) as a source -> install
"cm-daily-standup" -> restart Copilot App.

## Use

Ask Copilot in any session:

- "generate my standup"
- "what did I work on yesterday?"
- "summarize the last 3 days"

## Tools

| Tool | Use |
| --- | --- |
| `generate_standup` | Builds the markdown summary. Optional `days` override. |
| `get_config` / `set_config` | Default `days` window. |

## Sources

| Source | How | Filter |
| --- | --- | --- |
| Git commits | `git log` across every repo/worktree Copilot App has checked out | your `git config user.email`, window |
| GitHub PRs/issues | `gh search prs` / `gh search issues` | authored, commented, or reviewed by you, updated in window |
| Copilot App sessions | Read-only snapshot of `~/.copilot/data.db` | session `updated_at` in window |

Repos are discovered automatically from the Copilot App projects/worktrees you
already have configured — no repos-root setting needed.

Calendar/meetings are intentionally out of scope for v1 — that needs a Microsoft
Graph app registration and its own auth flow, which is a lot of setup for a
lightweight plugin.

## Files

```
.claude-plugin/plugin.json     plugin manifest
.mcp.json                      MCP server registration
mcp/server.mjs                 MCP stdio server (3 tools, zero dependencies)
bin/standup.mjs                CLI entry point
lib/config.mjs                 config load/save
lib/copilot-projects.mjs       read-only Copilot App project/worktree discovery
lib/git.mjs                    commit log across discovered checkouts
lib/github.mjs                 gh CLI search wrapper
lib/appdb.mjs                  read-only snapshot of Copilot App session data
lib/standup.mjs                merges sources, renders markdown
skills/cm-daily-standup/       skill that drives the standup flow
```

## Requirements

- Node 18+ (Node 22+ preferred for the built-in `node:sqlite` module)
- `git` on PATH
- `gh` (GitHub CLI), authenticated — GitHub activity is skipped if it's missing
- macOS, Linux, or Windows
