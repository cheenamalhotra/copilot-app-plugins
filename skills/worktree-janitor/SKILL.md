---
name: worktree-janitor
description: Find and clean up obsolete git worktrees left behind by Copilot App sessions. Presents candidates for review, deletes only what the user confirms, and can run scans on a schedule. WHEN "clean up worktrees", "obsolete worktrees", "stale worktrees", "delete old worktrees", "copilot worktrees taking space", "review my worktrees", "schedule worktree cleanup", "disk space from worktrees".
---

# Worktree Janitor

Cleans up worktrees Copilot App leaves behind under `~/Code/copilot-worktrees/<repo>/<name>`.
Deleting a worktree is irreversible, so this skill is **select-and-confirm by design**.

## Tools

| Tool | Use |
| --- | --- |
| `scan_worktrees` | Fresh scan. Takes ~30s on large repos. |
| `get_last_report` | Instant. Reuses the last scan, including scheduled background runs. |
| `preview_delete` | Dry run for a selection. |
| `delete_worktrees` | Real deletion. Requires `confirmed: true`. |
| `keep_worktrees` / `unkeep_worktrees` | Pin worktrees so scans stop suggesting them. |
| `get_config` / `set_config` | Roots, stale threshold, rules, safety flags. |
| `configure_schedule` | Install/remove/inspect the recurring scan. |

## Status meanings

- **obsolete** — no unsaved work, safe to delete.
- **review** — matched a cleanup rule but holds uncommitted or unpushed work. Never delete without calling this out explicitly.
- **active** — running session, locked, or recently used. Leave alone.
- **keep** — user pinned it.

## Workflow

1. Start with `get_last_report`. If it is empty or older than a day, run `scan_worktrees`.
2. Show the user a compact table grouped by status. For each row include path (shortened), branch, idle days, reasons, and blockers. Lead with **obsolete**, then **review**. Do not dump raw JSON.
3. Report the totals: how many obsolete, how many need review.
4. Ask which ones to delete. Accept loose answers like "all obsolete", "the merged ones", "everything older than 60 days" and resolve them to explicit paths yourself.
5. Echo back the exact list and wait for a clear yes. Never infer confirmation from an earlier message.
6. Call `delete_worktrees` with `confirmed: true` and the resolved paths.
7. Report what was deleted, skipped, or failed. If uncommitted work was salvaged, give the user the patch path.

## Rules

- Never pass `force: true` unless the user is told, in that turn, that it discards uncommitted or unpushed work and says yes anyway.
- Never delete anything in **active** status.
- If the user asks to keep something, call `keep_worktrees` rather than just remembering it.
- If a path is rejected as not being in the report, re-scan; the report is stale.

## Scheduling

`configure_schedule` installs a background scan (launchd on macOS, systemd/cron on Linux, Task Scheduler on Windows) that runs on an interval and posts a notification when candidates pile up. Scheduled runs **never delete anything** — they only refresh the report for the user to review later.

Default interval is 24h:

```
configure_schedule { "action": "install", "intervalHours": 24, "notify": true }
```

## Tuning

If the user says results are too aggressive or too quiet, adjust with `set_config`:

- `staleDays` — idle threshold, default 14.
- `rules.*` — toggle individual detection rules.
- `protectDirty` / `protectUnpushed` — keep these on unless the user insists.
- `roots` — extra directories to scan beyond the ones auto-discovered from the app database.
