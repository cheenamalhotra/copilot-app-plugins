# My Priorities

A Copilot App plugin that lists your top-priority GitHub work across every repo you
have locally: issues assigned to you, PRs awaiting your review, and open unassigned
priority issues you could pick up.

No extra accounts or tokens: it discovers repos from your Copilot App projects and
uses the `gh` CLI you're likely already authenticated with.

## Install

Part of the `cm-copilot-plugins` marketplace. In Copilot App: Plugins -> Manage
marketplaces -> add this repo (or its local path) as a source -> install
"cm-my-priorities" -> restart Copilot App.

## Use

Ask Copilot in any session:

- "what are my priorities?"
- "anything need my review?"
- "any priority issues I could pick up?"

## Tools

| Tool | Use |
| --- | --- |
| `list_priorities` | Builds the markdown summary, grouped by repo. |
| `get_config` / `set_config` | Change the ordered `priorityLabels` list. |

## How it works

For every Copilot App project with a linked GitHub repo:

| Section | Query |
| --- | --- |
| Assigned to you | `gh issue list --assignee @me --state open` |
| Awaiting your review | `gh pr list --search "review-requested:@me" --state open` |
| Open priority issues to pick up | `gh issue list --search "no:assignee" --state open`, filtered to issues carrying one of `priorityLabels` |

Items are sorted by priority rank: the label's position in your configured
`priorityLabels` list (default `["P0","P1","P2","priority","critical"]`) — first
in the list is highest priority. Items with no matching label sort last.

This plugin only lists candidates — it does not self-assign anything for you.
Assign yourself on GitHub once you've picked one up.

## Files

```
.claude-plugin/plugin.json      plugin manifest
.mcp.json                       MCP server registration
mcp/server.mjs                  MCP stdio server (3 tools, zero dependencies)
bin/priorities.mjs              CLI entry point
lib/config.mjs                  config load/save
lib/repos.mjs                   discovers Copilot App projects with a GitHub repo
lib/copilot-projects.mjs        read-only Copilot App project/worktree discovery
lib/github.mjs                  gh CLI queries + priority ranking
lib/priorities.mjs              merges sources, renders markdown
skills/cm-my-priorities/         skill that drives the flow
```

## Requirements

- Node 18+
- `git` on PATH
- `gh` (GitHub CLI), authenticated — nothing is returned if it's missing
- macOS, Linux, or Windows
