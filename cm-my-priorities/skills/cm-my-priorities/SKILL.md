---
name: cm-my-priorities
description: List top-priority GitHub work across your repos - issues assigned to you, PRs awaiting your review, and open unassigned priority issues you could pick up. WHEN "my priorities", "what should I work on", "what's assigned to me", "what needs my review", "any priority issues open", "what can I pick up".
---

# My Priorities

Scans every Copilot App project with a linked GitHub repo via the `gh` CLI and
surfaces three things per repo:

- **Assigned to you** — open issues where you're the assignee.
- **Awaiting your review** — open PRs where your review has been requested.
- **Open priority issues you could pick up** — open, unassigned issues that match one of
  your configured priority labels (default: `P0, P1, P2, priority, critical`).

Every item shows a best-effort status: issues get `Has PR #123` when one's already linked,
a matching `waitingLabels` entry (or a generic waiting/blocked/stale label) otherwise, or
`Open`; PRs get `Draft`, `Changes requested`, `Approved`, or `Review requested`.

Items are sorted by priority label rank (the label's position in the config list — first
is highest priority; items with no matching label sort last).

## Tools

| Tool | Use |
| --- | --- |
| `list_priorities` | Produces the actionable markdown report (summary, Do next, tables). |
| `get_config` / `set_config` | Change the ordered `priorityLabels` or `waitingLabels` list. |

## Flow

1. User asks what's on their plate ("what are my priorities", "anything need my review").
2. Call `list_priorities`.
3. Present the returned markdown as-is — summary line, Do next shortlist, then the
   Assigned issues / Awaiting review / Open priority issues sections.
4. This plugin only lists candidates for pickup; it does not self-assign issues. Tell the
   user to assign themselves on GitHub if they want to pick one up.

Nothing is written anywhere; only `gh` (GitHub CLI, already authenticated) and your
Copilot App project data are read.
