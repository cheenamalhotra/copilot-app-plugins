import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { COPILOT_HOME } from './config.mjs';

const DB_FILE = path.join(COPILOT_HOME, 'data.db');

// The app keeps data.db open in WAL mode. Query a snapshot copy so a scan can
// never block or corrupt the live database.
function snapshot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wt-janitor-'));
  for (const suffix of ['', '-wal', '-shm']) {
    const src = `${DB_FILE}${suffix}`;
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, `data.db${suffix}`));
  }
  return { dir, file: path.join(dir, 'data.db') };
}

function query(file, sql) {
  const out = execFileSync('sqlite3', ['-readonly', '-json', file, sql], {
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  }).trim();
  return out ? JSON.parse(out) : [];
}

export function isAvailable() {
  return fs.existsSync(DB_FILE);
}

export function loadAppState() {
  if (!isAvailable()) return { available: false, projects: [], worktrees: [] };
  const snap = snapshot();
  try {
    const projects = query(
      snap.file,
      `SELECT id, name, main_repo_path AS repoPath, default_branch AS defaultBranch
       FROM projects`,
    );
    const worktrees = query(
      snap.file,
      `SELECT w.id, w.project_id AS projectId, w.path, w.branch, w.base_branch AS baseBranch,
              w.created_at AS createdAt,
              ws.id AS workspaceId, ws.name AS workspaceName, ws.archived_at AS archivedAt,
              ws.updated_at AS workspaceUpdatedAt,
              COALESCE(ws.created_pr_state, ws.source_pr_state) AS prState,
              COALESCE(ws.created_pr_merged_at, ws.source_pr_merged_at) AS prMergedAt,
              COALESCE(ws.created_pr_number, ws.source_pr_number) AS prNumber,
              COALESCE(ws.created_pr_html_url, ws.source_pr_html_url) AS prUrl,
              ws.session_id AS sessionId,
              s.is_running AS sessionRunning, s.archived_at AS sessionArchivedAt,
              s.updated_at AS sessionUpdatedAt, s.title AS sessionTitle
       FROM worktrees w
       LEFT JOIN workspaces ws ON ws.worktree_id = w.id
       LEFT JOIN sessions s ON s.id = ws.session_id`,
    );
    return { available: true, projects, worktrees };
  } finally {
    fs.rmSync(snap.dir, { recursive: true, force: true });
  }
}
