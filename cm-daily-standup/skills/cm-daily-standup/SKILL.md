---
name: cm-daily-standup
description: Generate a standup summary of what you worked on recently, grouped by repo - git commits, GitHub PRs/issues you authored/reviewed/commented on, and Copilot App sessions. WHEN "standup", "what did I do yesterday", "daily standup", "what have I worked on", "summarize my work", "what's my status".
---

# Daily Standup

Builds a standup summary from three sources, with no extra auth setup required:

- **Git commits** — auto-discovers every repo/worktree checkout listed in your Copilot App
  projects, and pulls your commits (matched by your global `git config user.email`) in the window.
- **GitHub PRs/issues** — via the `gh` CLI: things you authored, commented on, or reviewed,
  updated in the window.
- **Copilot App sessions** — sessions you worked in, read from the app's local database.

## Tools

| Tool | Use |
| --- | --- |
| `generate_standup` | Produces the markdown summary. Pass `days` to override the default window. |
| `get_config` / `set_config` | Change the default `days` window. |

## Flow

1. User asks for a standup ("what did I do yesterday", "generate my standup").
2. Call `generate_standup` (optionally with `days`).
3. Present the returned markdown as-is in chat — it's already grouped by repo with
   Commits / PRs & Issues / Copilot sessions sections.

Nothing is written anywhere and no external service is contacted besides `gh` (GitHub CLI,
already authenticated) and your local git repos and Copilot App database (read-only).
