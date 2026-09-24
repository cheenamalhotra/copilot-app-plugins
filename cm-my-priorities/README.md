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
| `list_priorities` | Builds the actionable markdown report (summary, Do next, tables). |
| `get_config` / `set_config` | Change the ordered `priorityLabels` or `waitingLabels` list. |

## How it works

For every Copilot App project with a linked GitHub repo:

| Section | Query |
| --- | --- |
| Assigned to you | `gh issue list --assignee @me --state open` |
| Awaiting your review | `gh pr list --search "review-requested:@me" --state open` |
| Open priority issues to pick up | `gh issue list --search "no:assignee" --state open`, filtered to issues carrying one of `priorityLabels` |

Every item shows a best-effort **status**:

- Issues: `Has PR #123` (already has a linked/closing PR), a matching `waitingLabels`
  entry or a generic waiting/blocked/stale-labeled name, or `Open`.
- PRs: `Draft`, `Changes requested`, `Approved`, or `Review requested`.

Items are sorted by priority rank: the label's position in your configured
`priorityLabels` list (default `["P0","P1","P2","priority","critical"]`) — first
in the list is highest priority. Items with no matching label sort last.

## Output

The report leads with a summary and a **Do next** shortlist, then full tables:

```
# My priorities

_Generated ... · repos: 9 · priority labels: P0, P1, P2, priority, critical_

**Summary:** 9 assigned issues | 28 review requests | 1 changes requested | 3 drafts | 0 pickable

## Do next
(changes-requested PRs, then review-requested PRs, then unstarted assigned issues — top 10)

## Assigned issues (9)
(table: Repo | # | Status | Title — open issues first, then has-PR, then waiting)

## Awaiting review (28)
(table, sorted: changes-requested > review-requested > approved > draft)

## Open priority issues to pick up (0)
_None found._
```

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
